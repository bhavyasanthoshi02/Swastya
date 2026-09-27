/* ENUMS */
CREATE TYPE user_role AS ENUM (
    'ADMIN',
    'DONOR',
    'REQUESTER',
    'HOSPITAL',
    'BLOOD_BANK'
);
CREATE TYPE availability_status AS ENUM (
    'AVAILABLE',
    'TEMPORARILY_UNAVAILABLE',
    'PERMANENTLY_UNAVAILABLE'
);
CREATE TYPE urgency_level AS ENUM (
    'LOW',
    'MEDIUM',
    'HIGH',
    'CRITICAL'
);
CREATE TYPE request_status AS ENUM (
    'CREATED',
    'VERIFIED',
    'HOSPITAL_REVIEW',
    'BLOOD_BANK_CHECK',
    'DONOR_MATCHING',
    'BLOOD_ARRANGED',
    'FULFILLED',
    'CANCELLED',
    'EXPIRED'
);
CREATE TYPE notification_type AS ENUM (
    'REQUEST',
    'MATCH',
    'INVENTORY',
    'VERIFICATION',
    'SYSTEM'
);
CREATE TYPE approval_status AS ENUM (
    'PENDING',
    'APPROVED',
    'REJECTED'
);
CREATE TYPE prescription_status AS ENUM (
    'PENDING',
    'VERIFIED',
    'REJECTED'
);
CREATE TYPE coordination_status AS ENUM (
    'PENDING',
    'ACCEPTED',
    'REJECTED'
);
CREATE TYPE blood_group AS ENUM (
    'A+',
    'A-',
    'B+',
    'B-',
    'AB+',
    'AB-',
    'O+',
    'O-'
);
CREATE TYPE gender_type AS ENUM (
    'MALE',
    'FEMALE',
    'OTHER'
);
CREATE TYPE blood_component AS ENUM (
    'WHOLE_BLOOD',
    'PLATELETS',
    'PLASMA',
    'RBC'
);

/*EXTENSIONS */
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

/* TABLES */
--USER TABLE
CREATE TABLE Users (
    userId UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(100) NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    phoneNumber VARCHAR(15),
    password VARCHAR(255) NOT NULL,
    role user_role NOT NULL,
    isActive BOOLEAN DEFAULT TRUE,
    emailVerified BOOLEAN DEFAULT FALSE,
    createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

--DONOR TABLE
CREATE TABLE Donors (
    donorId UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    userId UUID UNIQUE NOT NULL,
    bloodGroup blood_group NOT NULL,
    dateOfBirth DATE NOT NULL,
    gender gender_type NOT NULL,
    weight DECIMAL(5,2),
    city VARCHAR(100) NOT NULL,
    state VARCHAR(100) NOT NULL,
    pincode VARCHAR(10) NOT NULL,
    latitude DECIMAL(9,6),
    longitude DECIMAL(9,6),
    availabilityStatus availability_status DEFAULT 'AVAILABLE',
    isEligible BOOLEAN DEFAULT TRUE,
    lastDonationDate DATE,
    createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_donor_user
        FOREIGN KEY (userId)
        REFERENCES Users(userId)
        ON DELETE CASCADE
);

--REQUESTER TABLE
CREATE TABLE Requesters (
    requesterId UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    userId UUID UNIQUE NOT NULL,
    address VARCHAR(255) NOT NULL,
    city VARCHAR(100) NOT NULL,
    state VARCHAR(100) NOT NULL,
    pincode VARCHAR(10) NOT NULL,
    latitude DECIMAL(9,6),
    longitude DECIMAL(9,6),
    createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_requester_user
        FOREIGN KEY (userId)
        REFERENCES Users(userId)
        ON DELETE CASCADE
);

--HOSPITAL TABLE
CREATE TABLE Hospitals (
    hospitalId UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    userId UUID UNIQUE NOT NULL,
    hospitalName VARCHAR(255) NOT NULL,
    registrationNumber VARCHAR(100) UNIQUE NOT NULL,
    contactPersonName VARCHAR(100) NOT NULL,
    contactPersonPhone VARCHAR(15) NOT NULL,
    address VARCHAR(255) NOT NULL,
    city VARCHAR(100) NOT NULL,
    state VARCHAR(100) NOT NULL,
    pincode VARCHAR(10) NOT NULL,
    latitude DECIMAL(9,6),
    longitude DECIMAL(9,6),
    approvalStatus approval_status DEFAULT 'PENDING',
    createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_hospital_user
        FOREIGN KEY (userId)
        REFERENCES Users(userId)
        ON DELETE CASCADE
);

--BLOOD BANK TABLE
CREATE TABLE BloodBanks (
    bloodBankId UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    userId UUID UNIQUE NOT NULL,
    bloodBankName VARCHAR(255) NOT NULL,
    licenseNumber VARCHAR(100) UNIQUE NOT NULL,
    contactPersonName VARCHAR(100) NOT NULL,
    contactPersonPhone VARCHAR(15) NOT NULL,
    address VARCHAR(255) NOT NULL,
    city VARCHAR(100) NOT NULL,
    state VARCHAR(100) NOT NULL,
    pincode VARCHAR(10) NOT NULL,
    latitude DECIMAL(9,6),
    longitude DECIMAL(9,6),
    approvalStatus approval_status DEFAULT 'PENDING',
    createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_bloodbank_user
        FOREIGN KEY (userId)
        REFERENCES Users(userId)
        ON DELETE CASCADE
);

--BLOOD REQUEST TABLE
CREATE TABLE BloodRequests (
    requestId UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    createdByUserId UUID NOT NULL,
    requesterId UUID,
    hospitalId UUID,
    patientName VARCHAR(100) NOT NULL,
    patientAge INTEGER NOT NULL,
    patientGender gender_type NOT NULL,
    patientContact VARCHAR(15) NOT NULL,
    bloodGroup blood_group NOT NULL,
    bloodComponent blood_component NOT NULL,
    unitsRequired INTEGER NOT NULL,
    urgencyLevel urgency_level NOT NULL,
    isEmergency BOOLEAN DEFAULT FALSE,
    searchRadius INTEGER DEFAULT 5,
    requiredBy TIMESTAMP NOT NULL,
    status request_status DEFAULT 'CREATED',
    notes TEXT,
    createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_request_creator
        FOREIGN KEY (createdByUserId)
        REFERENCES Users(userId),
    CONSTRAINT fk_request_requester
        FOREIGN KEY (requesterId)
        REFERENCES Requesters(requesterId),
    CONSTRAINT fk_request_hospital
        FOREIGN KEY (hospitalId)
        REFERENCES Hospitals(hospitalId)
);

-- PRESCIPRION TABLE
CREATE TABLE Prescription (
    prescriptionId UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    requestId UUID UNIQUE NOT NULL,
    fileUrl TEXT NOT NULL,
    doctorName VARCHAR(100) NOT NULL,
    hospitalName VARCHAR(255) NOT NULL,
    status prescription_status DEFAULT 'PENDING',
    verifiedByHospitalId UUID,
    verificationDate TIMESTAMP,
    remarks TEXT,
    uploadedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_prescription_request
        FOREIGN KEY (requestId)
        REFERENCES BloodRequests(requestId),
    CONSTRAINT fk_prescription_hospital
        FOREIGN KEY (verifiedByHospitalId)
        REFERENCES Hospitals(hospitalId)
);

-- INVENTORY TABLE
CREATE TABLE Inventory (
    inventoryId UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    bloodBankId UUID NOT NULL,
    bloodGroup blood_group NOT NULL,
    bloodComponent blood_component NOT NULL,
    unitsAvailable INTEGER NOT NULL DEFAULT 0,
    unitsReserved INTEGER NOT NULL DEFAULT 0,
    expiryDate DATE NOT NULL,
    lastUpdated TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_inventory_bloodbank
        FOREIGN KEY (bloodBankId)
        REFERENCES BloodBanks(bloodBankId)
        ON DELETE CASCADE
);

--REQUEST STATUS TRACKER TABLE
CREATE TABLE RequestStatusHistory (
    historyId UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    requestId UUID NOT NULL,
    oldStatus request_status,
    newStatus request_status NOT NULL,
    changedByUserId UUID,
    remarks TEXT,
    changedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_statushistory_request
        FOREIGN KEY (requestId)
        REFERENCES BloodRequests(requestId)
        ON DELETE CASCADE,
    CONSTRAINT fk_statushistory_user
        FOREIGN KEY (changedByUserId)
        REFERENCES Users(userId)
);

-- DONATION HISTORY TABLE
CREATE TABLE DonationHistory (
    donationHistoryId UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    donorId UUID NOT NULL,
    requestId UUID NOT NULL,
    unitsDonated INTEGER NOT NULL,
    donationDate DATE NOT NULL,
    bloodBankId UUID,
    hospitalId UUID,
    remarks TEXT,
    createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_donation_donor
        FOREIGN KEY (donorId)
        REFERENCES Donors(donorId),
    CONSTRAINT fk_donation_request
        FOREIGN KEY (requestId)
        REFERENCES BloodRequests(requestId),
    CONSTRAINT fk_donation_bloodbank
        FOREIGN KEY (bloodBankId)
        REFERENCES BloodBanks(bloodBankId),
    CONSTRAINT fk_donation_hospital
        FOREIGN KEY (hospitalId)
        REFERENCES Hospitals(hospitalId)
);

-- HOSPITAL COORDINATION TABLE
CREATE TABLE HospitalCoordination (
    coordinationId UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    requestId UUID NOT NULL,
    fromHospitalId UUID NOT NULL,
    toHospitalId UUID NOT NULL,
    status coordination_status DEFAULT 'PENDING',
    remarks TEXT,
    createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    respondedAt TIMESTAMP,
    CONSTRAINT fk_coordination_request
        FOREIGN KEY (requestId)
        REFERENCES BloodRequests(requestId),
    CONSTRAINT fk_coordination_from_hospital
        FOREIGN KEY (fromHospitalId)
        REFERENCES Hospitals(hospitalId),
    CONSTRAINT fk_coordination_to_hospital
        FOREIGN KEY (toHospitalId)
        REFERENCES Hospitals(hospitalId)
);

-- NOTIFICATIONS TABLE
CREATE TABLE Notification (
    notificationId UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    userId UUID NOT NULL,
    requestId UUID,
    type notification_type NOT NULL,
    title VARCHAR(255) NOT NULL,
    message TEXT NOT NULL,
    isRead BOOLEAN DEFAULT FALSE,
    sentAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    readAt TIMESTAMP,
    CONSTRAINT fk_notification_user
        FOREIGN KEY (userId)
        REFERENCES Users(userId)
        ON DELETE CASCADE,
    CONSTRAINT fk_notification_request
        FOREIGN KEY (requestId)
        REFERENCES BloodRequests(requestId)
);

-- MODIFICATIONS
ALTER TABLE BloodRequests
ADD CONSTRAINT chk_patient_age
CHECK (patientAge > 0);

ALTER TABLE BloodRequests
ADD CONSTRAINT chk_units_required
CHECK (unitsRequired > 0);

ALTER TABLE Inventory
ADD CONSTRAINT chk_units_available
CHECK (unitsAvailable >= 0);

ALTER TABLE Inventory
ADD CONSTRAINT chk_units_reserved
CHECK (unitsReserved >= 0);

ALTER TABLE Inventory
ADD CONSTRAINT uq_inventory
UNIQUE (
    bloodBankId,
    bloodGroup,
    bloodComponent,
    expiryDate
);

ALTER TABLE Donors
ADD COLUMN address VARCHAR(255);

/* INDEXING */
CREATE INDEX idx_users_email
ON Users(email);

CREATE INDEX idx_donors_bloodgroup
ON Donors(bloodGroup);

CREATE INDEX idx_bloodrequests_status
ON BloodRequests(status);

CREATE INDEX idx_inventory_bloodgroup
ON Inventory(bloodGroup);

CREATE INDEX idx_notification_user
ON Notification(userId);