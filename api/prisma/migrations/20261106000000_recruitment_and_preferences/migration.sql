-- CreateEnum
CREATE TYPE "RequirementStatus" AS ENUM ('DRAFT', 'OPEN', 'IN_PROGRESS', 'ON_HOLD', 'CLOSED');

-- CreateEnum
CREATE TYPE "CandidateStatus" AS ENUM ('SUBMITTED', 'UNDER_REVIEW', 'SHORTLISTED', 'INTERVIEW_SCHEDULED', 'SELECTED', 'REJECTED', 'ON_HOLD');

-- AlterEnum
ALTER TYPE "Role" ADD VALUE 'HR_MANAGER';
ALTER TYPE "Role" ADD VALUE 'HR_SUPPORT';

-- AlterEnum
ALTER TYPE "NotificationType" ADD VALUE 'RECRUITMENT';

-- CreateTable
CREATE TABLE "recruitment_requirements" (
    "id" TEXT NOT NULL,
    "reqCode" VARCHAR(50) NOT NULL,
    "title" VARCHAR(200) NOT NULL,
    "department" VARCHAR(100) NOT NULL,
    "vacancies" INTEGER NOT NULL DEFAULT 1,
    "location" VARCHAR(100) NOT NULL,
    "employmentType" VARCHAR(50) NOT NULL DEFAULT 'Full-time',
    "priority" VARCHAR(20) NOT NULL DEFAULT 'MEDIUM',
    "creationMethod" VARCHAR(50) NOT NULL DEFAULT 'MANUAL',
    "jdFileId" VARCHAR(100),
    "jdFileName" VARCHAR(255),
    "jdFileSize" INTEGER,
    "jdFilePath" VARCHAR(500),
    "jdMimeType" VARCHAR(120),
    "qualification" VARCHAR(200),
    "specialization" VARCHAR(200),
    "minExp" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "maxExp" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "techSkills" TEXT,
    "softSkills" TEXT,
    "certifications" TEXT,
    "description" TEXT,
    "responsibilities" TEXT,
    "requiredSkills" TEXT,
    "preferredSkills" TEXT,
    "additionalInstructions" TEXT,
    "salaryRange" VARCHAR(100),
    "expectedJoiningDate" DATE,
    "deadline" DATE,
    "status" "RequirementStatus" NOT NULL DEFAULT 'OPEN',
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "recruitment_requirements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "requirement_assignments" (
    "id" TEXT NOT NULL,
    "requirementId" TEXT NOT NULL,
    "hrSupportId" TEXT NOT NULL,
    "assignedById" TEXT NOT NULL,
    "assignedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" VARCHAR(50) NOT NULL DEFAULT 'ACTIVE',

    CONSTRAINT "requirement_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "candidates" (
    "id" TEXT NOT NULL,
    "candidateCode" VARCHAR(50) NOT NULL,
    "requirementId" TEXT NOT NULL,
    "submittedById" TEXT NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "email" VARCHAR(255) NOT NULL,
    "phone" VARCHAR(50) NOT NULL,
    "normalizedEmail" VARCHAR(255) NOT NULL,
    "normalizedPhone" VARCHAR(50) NOT NULL,
    "qualification" VARCHAR(200) NOT NULL,
    "specialization" VARCHAR(200),
    "college" VARCHAR(200),
    "graduationYear" INTEGER,
    "totalExp" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "relevantExp" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "techSkills" TEXT NOT NULL,
    "softSkills" TEXT,
    "currentLocation" VARCHAR(100) NOT NULL,
    "preferredLocation" VARCHAR(100),
    "currentCtc" VARCHAR(100),
    "expectedCtc" VARCHAR(100),
    "noticePeriod" VARCHAR(100),
    "resumeLink" VARCHAR(1000),
    "source" VARCHAR(100),
    "hrRemarks" TEXT,
    "status" "CandidateStatus" NOT NULL DEFAULT 'SUBMITTED',
    "interviewDate" TIMESTAMPTZ(6),
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "candidates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "candidate_status_history" (
    "id" TEXT NOT NULL,
    "candidateId" TEXT NOT NULL,
    "previousStatus" "CandidateStatus",
    "newStatus" "CandidateStatus" NOT NULL,
    "changedById" TEXT NOT NULL,
    "remarks" TEXT,
    "interviewFeedback" TEXT,
    "internalNotes" TEXT,
    "nextAction" VARCHAR(255),
    "interviewDate" TIMESTAMPTZ(6),
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "candidate_status_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_preferences" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "notifications" JSONB,
    "recruitment" JSONB,
    "work" JSONB,
    "appearance" JSONB,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "user_preferences_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "recruitment_requirements_reqCode_key" ON "recruitment_requirements"("reqCode");

-- CreateIndex
CREATE INDEX "recruitment_requirements_status_createdAt_idx" ON "recruitment_requirements"("status", "createdAt");

-- CreateIndex
CREATE INDEX "recruitment_requirements_createdById_idx" ON "recruitment_requirements"("createdById");

-- CreateIndex
CREATE INDEX "requirement_assignments_hrSupportId_status_idx" ON "requirement_assignments"("hrSupportId", "status");

-- CreateIndex
CREATE INDEX "requirement_assignments_requirementId_idx" ON "requirement_assignments"("requirementId");

-- CreateIndex
CREATE UNIQUE INDEX "requirement_assignments_requirementId_hrSupportId_key" ON "requirement_assignments"("requirementId", "hrSupportId");

-- CreateIndex
CREATE UNIQUE INDEX "candidates_candidateCode_key" ON "candidates"("candidateCode");

-- CreateIndex
CREATE INDEX "candidates_requirementId_status_idx" ON "candidates"("requirementId", "status");

-- CreateIndex
CREATE INDEX "candidates_submittedById_idx" ON "candidates"("submittedById");

-- CreateIndex
CREATE INDEX "candidates_requirementId_normalizedEmail_idx" ON "candidates"("requirementId", "normalizedEmail");

-- CreateIndex
CREATE INDEX "candidates_requirementId_normalizedPhone_idx" ON "candidates"("requirementId", "normalizedPhone");

-- CreateIndex
CREATE INDEX "candidate_status_history_candidateId_createdAt_idx" ON "candidate_status_history"("candidateId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "user_preferences_userId_key" ON "user_preferences"("userId");

-- AddForeignKey
ALTER TABLE "recruitment_requirements" ADD CONSTRAINT "recruitment_requirements_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "requirement_assignments" ADD CONSTRAINT "requirement_assignments_requirementId_fkey" FOREIGN KEY ("requirementId") REFERENCES "recruitment_requirements"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "requirement_assignments" ADD CONSTRAINT "requirement_assignments_hrSupportId_fkey" FOREIGN KEY ("hrSupportId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "requirement_assignments" ADD CONSTRAINT "requirement_assignments_assignedById_fkey" FOREIGN KEY ("assignedById") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "candidates" ADD CONSTRAINT "candidates_requirementId_fkey" FOREIGN KEY ("requirementId") REFERENCES "recruitment_requirements"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "candidates" ADD CONSTRAINT "candidates_submittedById_fkey" FOREIGN KEY ("submittedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "candidate_status_history" ADD CONSTRAINT "candidate_status_history_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "candidates"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "candidate_status_history" ADD CONSTRAINT "candidate_status_history_changedById_fkey" FOREIGN KEY ("changedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_preferences" ADD CONSTRAINT "user_preferences_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
