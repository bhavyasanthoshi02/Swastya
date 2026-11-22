/**
 * MSG91 Client-Side OTP Widget Helper for Swastya
 * 
 * Handles script loading with fallback URLs, initializes window.initSendOTP with
 * configured widget credentials, and handles callbacks and token extraction.
 */

declare global {
  interface Window {
    initSendOTP?: (configuration: any) => void;
  }
}

export interface Msg91OtpOptions {
  identifier?: string;
  onSuccess: (accessToken: string, rawData?: any) => void;
  onFailure?: (error: any) => void;
}

const OTP_SCRIPT_URLS = [
  "https://verify.msg91.com/otp-provider.js",
  "https://verify.phone91.com/otp-provider.js",
];

let scriptLoadPromise: Promise<void> | null = null;

/**
 * Robust loader following MSG91's attempt fallback algorithm
 */
export const loadMsg91Script = (): Promise<void> => {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("Cannot load OTP script on server."));
  }

  if (typeof window.initSendOTP === "function") {
    return Promise.resolve();
  }

  if (scriptLoadPromise) {
    return scriptLoadPromise;
  }

  scriptLoadPromise = new Promise((resolve, reject) => {
    let index = 0;

    const attempt = () => {
      const script = document.createElement("script");
      script.type = "text/javascript";
      script.src = OTP_SCRIPT_URLS[index];
      script.async = true;

      script.onload = () => {
        if (typeof window.initSendOTP === "function") {
          resolve();
        } else {
          // Poll briefly in case initSendOTP registers shortly after execution
          let attempts = 0;
          const interval = setInterval(() => {
            attempts++;
            if (typeof window.initSendOTP === "function") {
              clearInterval(interval);
              resolve();
            } else if (attempts >= 10) {
              clearInterval(interval);
              tryNext();
            }
          }, 100);
        }
      };

      script.onerror = () => {
        tryNext();
      };

      const tryNext = () => {
        script.remove();
        index++;
        if (index < OTP_SCRIPT_URLS.length) {
          attempt();
        } else {
          scriptLoadPromise = null;
          reject(new Error("Failed to load MSG91 OTP widget from all available providers."));
        }
      };

      document.head.appendChild(script);
    };

    attempt();
  });

  return scriptLoadPromise;
};

/**
 * Triggers the MSG91 OTP Widget popup modal.
 * Collects mobile number, handles verification, and resolves with verified access token.
 */
export const triggerMsg91Otp = async (options: Msg91OtpOptions): Promise<void> => {
  const widgetId = process.env.NEXT_PUBLIC_MSG91_WIDGET_ID || "366b766c6f4c393832323636";
  const tokenAuth = process.env.NEXT_PUBLIC_MSG91_TOKEN_AUTH || "592565TvG0U19FZgNZ6b02e021P1";

  try {
    await loadMsg91Script();

    if (typeof window.initSendOTP !== "function") {
      throw new Error("MSG91 OTP widget initializer not found.");
    }

    const configuration: any = {
      widgetId,
      tokenAuth,
      success: (data: any) => {
        // Extract the JWT access token from MSG91's response payload
        let token = "";
        if (typeof data === "string") {
          token = data;
        } else if (data?.token) {
          token = data.token;
        } else if (data?.["access-token"]) {
          token = data["access-token"];
        } else if (typeof data?.message === "string" && data.message.startsWith("ey")) {
          token = data.message;
        } else if (data?.message) {
          token = String(data.message);
        }

        options.onSuccess(token, data);
      },
      failure: (error: any) => {
        console.warn("[MSG91 Widget] OTP Verification Failure:", error);
        options.onFailure?.(error);
      },
    };

    if (options.identifier && options.identifier.trim() !== "") {
      configuration.identifier = options.identifier.trim();
    }

    window.initSendOTP(configuration);
  } catch (err: any) {
    console.error("[MSG91 Widget] Error initializing OTP widget:", err);
    options.onFailure?.(err);
  }
};
