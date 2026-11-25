**1. Live blood inventory synchronization**
We did not implement live blood inventory synchronization because it requires direct integration with the inventory management systems used by individual blood banks. Since we did not have access to their internal systems or APIs, we could not automatically retrieve and update real-time blood stock information.

**2. Whatsapp Notifications**
Our platform sends notifications to matching donors, hospitals, and blood banks through SMS. We also attempted to integrate WhatsApp notifications, but the integration could not be completed. WhatsApp Business API access requires Meta's project verification and approval, which may take time. We also explored free API options, but we were unable to successfully integrate them. Therefore, we continued with SMS notifications as our primary communication channel.

**3. Advanced AI prediction using real data**
We did not implement advanced AI prediction using real historical blood demand data because we did not have access to sufficient verified data from hospitals and blood banks. Accurate prediction requires large amounts of reliable historical information, such as blood requests, stock availability, and demand patterns.

**4. Changing the location of the donor**
We did not implement an automatic donor location-changing feature because our primary focus was on developing the core blood coordination functionalities within the available project timeline. Implementing this feature would require additional location management and donor availability handling. Therefore, we prioritized the essential features needed for blood request processing and donor matching.

**5. Blood Unit Traceability**
We did not implement the complete blood unit traceability system because we lacked access to sufficient real-world blood unit data from hospitals and blood banks. Implementing this feature requires reliable records of individual blood units, including collection details, screening status, storage information, expiry dates and movement history. Since such data was not available for development and testing, we prioritized the core blood coordination features and considered comprehensive blood unit traceability as a future enhancement.

**6.Blood Request Status Being Updated**
So as of now the blood request status is updated for the requester and the donor (like who donated the blood it could be hospital or donor or bloodbank) and its being updated for everyone when the blood request is fulfilled but its not being updated when the donor is found so that part we are yet to implement as we are focusing on the main features to work perfectly we missed out working on this. It is considered as future enhancement.