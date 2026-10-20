import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Baseline: schema della v1.3 (in produzione creato da TypeORM synchronize).
 * - DB esistente (tabella "users" presente): non fa nulla, registra solo la migrazione come eseguita.
 * - DB vuoto: crea lo schema v1.3, così le migrazioni successive partono sempre dallo stesso punto.
 * SQL ricavato con pg_dump --schema-only dal backup di produzione del 20/10/2026.
 */
export class Baseline1700000000000 implements MigrationInterface {
  name = 'Baseline1700000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const existing = await queryRunner.query(`SELECT to_regclass('public.users') AS t`);
    if (existing[0]?.t) {
      return;
    }
    const statements: string[] = [
      "CREATE EXTENSION IF NOT EXISTS \"uuid-ossp\" WITH SCHEMA public",
      "CREATE TYPE public.categories_type_enum AS ENUM (\n    'INCOME',\n    'EXPENSE',\n    'BOTH'\n)",
      "CREATE TYPE public.files_filetype_enum AS ENUM (\n    'IMAGE',\n    'DOCUMENT',\n    'OTHER'\n)",
      "CREATE TYPE public.member_documents_documenttype_enum AS ENUM (\n    'MEDICAL_EXAM',\n    'IDENTITY_DOCUMENT',\n    'FISI_CARD',\n    'FIS_CARD',\n    'PHOTO',\n    'OTHER'\n)",
      "CREATE TYPE public.members_gender_enum AS ENUM (\n    'M',\n    'F'\n)",
      "CREATE TYPE public.members_membertype_enum AS ENUM (\n    'ATHLETE',\n    'PARENT',\n    'MEMBER'\n)",
      "CREATE TYPE public.members_status_enum AS ENUM (\n    'ACTIVE',\n    'INACTIVE',\n    'SUSPENDED'\n)",
      "CREATE TYPE public.reminders_status_enum AS ENUM (\n    'SCHEDULED',\n    'SENT',\n    'FAILED',\n    'CANCELLED'\n)",
      "CREATE TYPE public.reminders_type_enum AS ENUM (\n    'VEHICLE_TAX',\n    'VEHICLE_INSPECTION',\n    'VEHICLE_INSURANCE',\n    'MEDICAL_CERTIFICATE',\n    'DRIVING_LICENSE',\n    'SKI_INSTRUCTOR_LICENSE',\n    'COACH_LICENSE',\n    'MEMBER_MEDICAL_CERTIFICATE'\n)",
      "CREATE TYPE public.staff_coachlevel_enum AS ENUM (\n    'I',\n    'II',\n    'III',\n    'IV',\n    'NAZIONALE'\n)",
      "CREATE TYPE public.staff_documents_documenttype_enum AS ENUM (\n    'MEDICAL_EXAM',\n    'COACH_LICENSE',\n    'DRIVING_LICENSE',\n    'FIRST_AID',\n    'OTHER'\n)",
      "CREATE TYPE public.staff_gender_enum AS ENUM (\n    'M',\n    'F'\n)",
      "CREATE TYPE public.staff_staffrole_enum AS ENUM (\n    'INSTRUCTOR',\n    'DRIVER',\n    'ADMIN',\n    'VOLUNTEER',\n    'OTHER'\n)",
      "CREATE TYPE public.staff_status_enum AS ENUM (\n    'ACTIVE',\n    'INACTIVE',\n    'ON_LEAVE'\n)",
      "CREATE TYPE public.transactions_paymentmethod_enum AS ENUM (\n    'CASH',\n    'BANK_TRANSFER',\n    'CREDIT_CARD',\n    'CHECK',\n    'OTHER'\n)",
      "CREATE TYPE public.transactions_type_enum AS ENUM (\n    'INCOME',\n    'EXPENSE'\n)",
      "CREATE TYPE public.vehicles_status_enum AS ENUM (\n    'AVAILABLE',\n    'IN_USE',\n    'MAINTENANCE',\n    'OUT_OF_SERVICE'\n)",
      "CREATE TYPE public.vehicles_type_enum AS ENUM (\n    'MINIBUS',\n    'BUS',\n    'VAN',\n    'CAR',\n    'OTHER'\n)",
      "CREATE TABLE public.capabilities_per_role (\n    uuid uuid DEFAULT public.uuid_generate_v4() NOT NULL,\n    capability character varying NOT NULL,\n    \"roleCode\" character varying NOT NULL\n)",
      "CREATE TABLE public.categories (\n    uuid uuid DEFAULT public.uuid_generate_v4() NOT NULL,\n    \"createdAt\" timestamp without time zone DEFAULT now() NOT NULL,\n    \"updatedAt\" timestamp without time zone DEFAULT now() NOT NULL,\n    name character varying NOT NULL,\n    description character varying,\n    type public.categories_type_enum DEFAULT 'BOTH'::public.categories_type_enum NOT NULL,\n    color character varying,\n    icon character varying,\n    \"isActive\" boolean DEFAULT true NOT NULL,\n    \"sortOrder\" integer DEFAULT 0 NOT NULL\n)",
      "CREATE TABLE public.files (\n    uuid uuid DEFAULT public.uuid_generate_v4() NOT NULL,\n    \"createdAt\" timestamp without time zone DEFAULT now() NOT NULL,\n    \"updatedAt\" timestamp without time zone DEFAULT now() NOT NULL,\n    \"originalName\" character varying NOT NULL,\n    \"minioPath\" character varying NOT NULL,\n    \"mimeType\" character varying,\n    size bigint,\n    \"fileType\" public.files_filetype_enum DEFAULT 'OTHER'::public.files_filetype_enum NOT NULL,\n    description character varying\n)",
      "CREATE TABLE public.member_documents (\n    uuid uuid DEFAULT public.uuid_generate_v4() NOT NULL,\n    \"createdAt\" timestamp without time zone DEFAULT now() NOT NULL,\n    \"updatedAt\" timestamp without time zone DEFAULT now() NOT NULL,\n    \"documentType\" public.member_documents_documenttype_enum DEFAULT 'OTHER'::public.member_documents_documenttype_enum NOT NULL,\n    description text,\n    \"expiryDate\" date,\n    \"memberUuid\" uuid NOT NULL,\n    \"fileUuid\" character varying NOT NULL\n)",
      "CREATE TABLE public.members (\n    uuid uuid DEFAULT public.uuid_generate_v4() NOT NULL,\n    \"createdAt\" timestamp without time zone DEFAULT now() NOT NULL,\n    \"updatedAt\" timestamp without time zone DEFAULT now() NOT NULL,\n    \"firstName\" character varying NOT NULL,\n    \"lastName\" character varying NOT NULL,\n    gender public.members_gender_enum,\n    \"fiscalCode\" character varying,\n    \"birthDate\" date,\n    \"birthPlace\" character varying,\n    \"birthProvince\" character varying,\n    nationality character varying,\n    email character varying,\n    phone character varying,\n    address character varying,\n    city character varying,\n    province character varying,\n    \"postalCode\" character varying,\n    \"memberType\" public.members_membertype_enum DEFAULT 'MEMBER'::public.members_membertype_enum NOT NULL,\n    status public.members_status_enum DEFAULT 'ACTIVE'::public.members_status_enum NOT NULL,\n    \"isCompetitor\" boolean DEFAULT false NOT NULL,\n    \"fisiCode\" character varying,\n    \"fisCode\" character varying,\n    \"medicalExamExpiry\" date,\n    \"medicalExamCompetitive\" boolean DEFAULT false NOT NULL,\n    \"emergencyContact\" character varying,\n    \"emergencyPhone\" character varying,\n    notes text,\n    \"membershipDate\" date,\n    \"membershipExpiry\" date,\n    \"staffUuid\" uuid,\n    \"profileImageUuid\" character varying\n)",
      "CREATE TABLE public.reminders (\n    uuid uuid DEFAULT public.uuid_generate_v4() NOT NULL,\n    \"createdAt\" timestamp without time zone DEFAULT now() NOT NULL,\n    \"updatedAt\" timestamp without time zone DEFAULT now() NOT NULL,\n    type public.reminders_type_enum NOT NULL,\n    status public.reminders_status_enum DEFAULT 'SCHEDULED'::public.reminders_status_enum NOT NULL,\n    \"expiryDate\" date NOT NULL,\n    \"scheduledSendDate\" date NOT NULL,\n    \"sentAt\" timestamp without time zone,\n    \"recipientEmail\" character varying,\n    \"recipientName\" character varying,\n    \"subjectEntityUuid\" character varying,\n    \"subjectEntityType\" character varying,\n    \"subjectDescription\" character varying,\n    \"errorMessage\" text,\n    \"retryCount\" integer DEFAULT 0 NOT NULL,\n    \"ccEmail\" character varying\n)",
      "CREATE TABLE public.roles (\n    code character varying NOT NULL,\n    description character varying\n)",
      "CREATE TABLE public.settings (\n    key character varying NOT NULL,\n    value jsonb,\n    description character varying\n)",
      "CREATE TABLE public.staff (\n    uuid uuid DEFAULT public.uuid_generate_v4() NOT NULL,\n    \"createdAt\" timestamp without time zone DEFAULT now() NOT NULL,\n    \"updatedAt\" timestamp without time zone DEFAULT now() NOT NULL,\n    \"firstName\" character varying NOT NULL,\n    \"lastName\" character varying NOT NULL,\n    \"fiscalCode\" character varying,\n    email character varying,\n    phone character varying,\n    address character varying,\n    city character varying,\n    \"postalCode\" character varying,\n    \"birthDate\" date,\n    \"birthPlace\" character varying,\n    \"staffRole\" public.staff_staffrole_enum DEFAULT 'OTHER'::public.staff_staffrole_enum NOT NULL,\n    status public.staff_status_enum DEFAULT 'ACTIVE'::public.staff_status_enum NOT NULL,\n    \"hireDate\" date,\n    \"endDate\" date,\n    \"emergencyContact\" character varying,\n    \"emergencyPhone\" character varying,\n    notes text,\n    \"drivingLicense\" character varying,\n    \"drivingLicenseExpiry\" date,\n    \"skiInstructorLicense\" character varying,\n    \"skiInstructorLicenseExpiry\" date,\n    \"firstAidCertificate\" character varying,\n    \"firstAidCertificateExpiry\" date,\n    gender public.staff_gender_enum,\n    \"isCoach\" boolean DEFAULT false NOT NULL,\n    \"coachLevel\" public.staff_coachlevel_enum,\n    \"coachLicenseExpiry\" date,\n    \"medicalExamExpiry\" date,\n    \"profileImageUuid\" character varying,\n    \"linkedUserUuid\" character varying\n)",
      "CREATE TABLE public.staff_documents (\n    uuid uuid DEFAULT public.uuid_generate_v4() NOT NULL,\n    \"createdAt\" timestamp without time zone DEFAULT now() NOT NULL,\n    \"updatedAt\" timestamp without time zone DEFAULT now() NOT NULL,\n    \"documentType\" public.staff_documents_documenttype_enum DEFAULT 'OTHER'::public.staff_documents_documenttype_enum NOT NULL,\n    description text,\n    \"staffUuid\" uuid NOT NULL,\n    \"fileUuid\" character varying NOT NULL\n)",
      "CREATE TABLE public.transactions (\n    uuid uuid DEFAULT public.uuid_generate_v4() NOT NULL,\n    \"createdAt\" timestamp without time zone DEFAULT now() NOT NULL,\n    \"updatedAt\" timestamp without time zone DEFAULT now() NOT NULL,\n    type public.transactions_type_enum NOT NULL,\n    amount numeric(10,2) NOT NULL,\n    date date NOT NULL,\n    description character varying,\n    \"categoryUuid\" uuid,\n    \"paymentMethod\" public.transactions_paymentmethod_enum DEFAULT 'CASH'::public.transactions_paymentmethod_enum NOT NULL,\n    reference character varying,\n    \"invoiceNumber\" character varying,\n    counterpart character varying,\n    notes text,\n    \"attachmentUrl\" character varying,\n    \"isRecurring\" boolean DEFAULT false NOT NULL,\n    \"recurringPeriod\" character varying,\n    \"originalAmount\" numeric(10,2),\n    subject character varying,\n    notes2 text,\n    \"budgetItem\" character varying,\n    \"receiptMinioPath\" character varying,\n    \"receiptNumber\" integer,\n    \"receiptYear\" integer\n)",
      "CREATE TABLE public.users (\n    uuid uuid DEFAULT public.uuid_generate_v4() NOT NULL,\n    \"createdAt\" timestamp without time zone DEFAULT now() NOT NULL,\n    \"updatedAt\" timestamp without time zone DEFAULT now() NOT NULL,\n    username character varying NOT NULL,\n    password character varying NOT NULL,\n    \"firstName\" character varying,\n    \"lastName\" character varying,\n    email character varying,\n    phone character varying,\n    \"isActive\" boolean DEFAULT true NOT NULL,\n    \"roleCode\" character varying\n)",
      "CREATE TABLE public.vehicles (\n    uuid uuid DEFAULT public.uuid_generate_v4() NOT NULL,\n    \"createdAt\" timestamp without time zone DEFAULT now() NOT NULL,\n    \"updatedAt\" timestamp without time zone DEFAULT now() NOT NULL,\n    name character varying NOT NULL,\n    type public.vehicles_type_enum DEFAULT 'MINIBUS'::public.vehicles_type_enum NOT NULL,\n    brand character varying,\n    model character varying,\n    \"licensePlate\" character varying NOT NULL,\n    seats integer,\n    year integer,\n    status public.vehicles_status_enum DEFAULT 'AVAILABLE'::public.vehicles_status_enum NOT NULL,\n    \"insuranceExpiry\" date,\n    \"inspectionExpiry\" date,\n    \"taxExpiry\" date,\n    \"currentKm\" integer,\n    \"lastMaintenanceDate\" date,\n    \"nextMaintenanceKm\" integer,\n    \"fuelConsumption\" numeric(10,2),\n    \"fuelType\" character varying,\n    notes text,\n    \"imageUrl\" character varying,\n    \"assignedStaffUuid\" uuid\n)",
      "ALTER TABLE ONLY public.vehicles\n    ADD CONSTRAINT \"PK_44081a0503cec549614d57eba9a\" PRIMARY KEY (uuid)",
      "ALTER TABLE ONLY public.staff\n    ADD CONSTRAINT \"PK_63b4c676ecbf97749279446629f\" PRIMARY KEY (uuid)",
      "ALTER TABLE ONLY public.reminders\n    ADD CONSTRAINT \"PK_701bbf9ecb7a0e97719dcbf2380\" PRIMARY KEY (uuid)",
      "ALTER TABLE ONLY public.transactions\n    ADD CONSTRAINT \"PK_71ee7072c1ba2c23edc34fabfee\" PRIMARY KEY (uuid)",
      "ALTER TABLE ONLY public.member_documents\n    ADD CONSTRAINT \"PK_7e2d9729766329a6e4d53a4d6cf\" PRIMARY KEY (uuid)",
      "ALTER TABLE ONLY public.files\n    ADD CONSTRAINT \"PK_80216965527c9be0babd7ea5bbe\" PRIMARY KEY (uuid)",
      "ALTER TABLE ONLY public.users\n    ADD CONSTRAINT \"PK_951b8f1dfc94ac1d0301a14b7e1\" PRIMARY KEY (uuid)",
      "ALTER TABLE ONLY public.staff_documents\n    ADD CONSTRAINT \"PK_9ad4f84e261dce38a570da6e200\" PRIMARY KEY (uuid)",
      "ALTER TABLE ONLY public.categories\n    ADD CONSTRAINT \"PK_a4b5917e7297f757879582e1458\" PRIMARY KEY (uuid)",
      "ALTER TABLE ONLY public.settings\n    ADD CONSTRAINT \"PK_c8639b7626fa94ba8265628f214\" PRIMARY KEY (key)",
      "ALTER TABLE ONLY public.roles\n    ADD CONSTRAINT \"PK_f6d54f95c31b73fb1bdd8e91d0c\" PRIMARY KEY (code)",
      "ALTER TABLE ONLY public.members\n    ADD CONSTRAINT \"PK_fa2cce30c897dc4b49ff2fd3cdb\" PRIMARY KEY (uuid)",
      "ALTER TABLE ONLY public.capabilities_per_role\n    ADD CONSTRAINT \"PK_fc69d42d1ec785c331335d13646\" PRIMARY KEY (uuid)",
      "ALTER TABLE ONLY public.vehicles\n    ADD CONSTRAINT \"UQ_79a273823977d25c7523162cd5a\" UNIQUE (\"licensePlate\")",
      "ALTER TABLE ONLY public.members\n    ADD CONSTRAINT \"UQ_ad5369f6eb51459ce599f483769\" UNIQUE (\"staffUuid\")",
      "ALTER TABLE ONLY public.users\n    ADD CONSTRAINT \"UQ_fe0bb3f6520ee0469504521e710\" UNIQUE (username)",
      "ALTER TABLE ONLY public.capabilities_per_role\n    ADD CONSTRAINT \"FK_5c5cf7c0a2b6d757e5b538ea332\" FOREIGN KEY (\"roleCode\") REFERENCES public.roles(code) ON DELETE CASCADE",
      "ALTER TABLE ONLY public.users\n    ADD CONSTRAINT \"FK_63529f4d2e72dff0092c4a870cf\" FOREIGN KEY (\"roleCode\") REFERENCES public.roles(code)",
      "ALTER TABLE ONLY public.member_documents\n    ADD CONSTRAINT \"FK_a04dfec30c9044ecb0ef2e58f70\" FOREIGN KEY (\"memberUuid\") REFERENCES public.members(uuid) ON DELETE CASCADE",
      "ALTER TABLE ONLY public.vehicles\n    ADD CONSTRAINT \"FK_ac05e264e2c076a0629ca571041\" FOREIGN KEY (\"assignedStaffUuid\") REFERENCES public.staff(uuid)",
      "ALTER TABLE ONLY public.members\n    ADD CONSTRAINT \"FK_ad5369f6eb51459ce599f483769\" FOREIGN KEY (\"staffUuid\") REFERENCES public.staff(uuid)",
      "ALTER TABLE ONLY public.staff_documents\n    ADD CONSTRAINT \"FK_d16c98b8241227fc5eb52f31ce6\" FOREIGN KEY (\"staffUuid\") REFERENCES public.staff(uuid) ON DELETE CASCADE",
      "ALTER TABLE ONLY public.transactions\n    ADD CONSTRAINT \"FK_e7ec7fd5f173f92d0e648077a2f\" FOREIGN KEY (\"categoryUuid\") REFERENCES public.categories(uuid)",
    ];
    for (const statement of statements) {
      await queryRunner.query(statement);
    }
  }

  public async down(): Promise<void> {
    // La baseline non si annulla: rimuoverebbe tutti i dati.
  }
}
