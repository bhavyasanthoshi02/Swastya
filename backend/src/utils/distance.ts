/**
 * Location and Geographic Distance Utility
 * Implements the standard Haversine formula for spherical distance calculation between coordinates.
 */

export interface CoordinateValidationResult {
    valid: boolean;
    latitude?: number;
    longitude?: number;
    error?: string;
}

/**
 * Validates latitude and longitude ranges.
 * Latitude must be between -90 and 90.
 * Longitude must be between -180 and 180.
 */
export function validateCoordinates(latInput: any, lngInput: any): CoordinateValidationResult {
    if (latInput === undefined || latInput === null || lngInput === undefined || lngInput === null) {
        return { valid: false, error: "Coordinates not provided" };
    }

    const lat = typeof latInput === "number" ? latInput : parseFloat(String(latInput));
    const lng = typeof lngInput === "number" ? lngInput : parseFloat(String(lngInput));

    if (isNaN(lat) || isNaN(lng)) {
        return { valid: false, error: "Latitude and longitude must be valid numeric values" };
    }

    if (lat < -90 || lat > 90) {
        return { valid: false, error: "Latitude must be between -90 and 90 degrees" };
    }

    if (lng < -180 || lng > 180) {
        return { valid: false, error: "Longitude must be between -180 and 180 degrees" };
    }

    return {
        valid: true,
        latitude: parseFloat(lat.toFixed(6)),
        longitude: parseFloat(lng.toFixed(6)),
    };
}

/**
 * Calculates great-circle distance between two geographic coordinates using the Haversine formula.
 * @param lat1 Latitude of point 1 in decimal degrees
 * @param lon1 Longitude of point 1 in decimal degrees
 * @param lat2 Latitude of point 2 in decimal degrees
 * @param lon2 Longitude of point 2 in decimal degrees
 * @returns Distance in kilometers, rounded to 1 decimal place
 */
export function calculateHaversineDistanceKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const toRad = (angle: number) => (angle * Math.PI) / 180;
    const EARTH_RADIUS_KM = 6371.0; // Mean Earth radius in kilometers

    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);

    const rLat1 = toRad(lat1);
    const rLat2 = toRad(lat2);

    const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(rLat1) * Math.cos(rLat2) * Math.sin(dLon / 2) * Math.sin(dLon / 2);

    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    const distance = EARTH_RADIUS_KM * c;

    return Math.round(distance * 10) / 10;
}

/**
 * Resolves location matching status and calculates distance between a donor and a blood request.
 */
export function evaluateLocationDistance(
    donorLat: number | null | undefined,
    donorLng: number | null | undefined,
    reqLat: number | null | undefined,
    reqLng: number | null | undefined,
    searchRadiusKm: number = 5
): {
    hasCoordinates: boolean;
    distanceKm: number | null;
    isWithinRadius: boolean;
    distanceDisplay: string;
    locationMatch: "COORDINATES" | "CITY_FALLBACK" | "NONE";
} {
    // If either location lacks coordinates, calculate distance is impossible
    if (
        donorLat === null ||
        donorLat === undefined ||
        donorLng === null ||
        donorLng === undefined ||
        reqLat === null ||
        reqLat === undefined ||
        reqLng === null ||
        reqLng === undefined
    ) {
        return {
            hasCoordinates: false,
            distanceKm: null,
            isWithinRadius: false,
            distanceDisplay: "Distance unavailable - City match",
            locationMatch: "CITY_FALLBACK",
        };
    }

    const distance = calculateHaversineDistanceKm(donorLat, donorLng, reqLat, reqLng);
    const effectiveRadius = Math.max(1, Math.min(100, searchRadiusKm));
    const isWithinRadius = distance <= effectiveRadius;

    return {
        hasCoordinates: true,
        distanceKm: distance,
        isWithinRadius,
        distanceDisplay: `${distance.toFixed(1)} km away`,
        locationMatch: "COORDINATES",
    };
}
