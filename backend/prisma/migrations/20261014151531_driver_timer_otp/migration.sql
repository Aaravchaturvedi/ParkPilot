-- AlterTable
ALTER TABLE "bookings" ADD COLUMN     "billedMinutes" INTEGER,
ADD COLUMN     "endOtp" TEXT,
ADD COLUMN     "endOtpExpiresAt" TIMESTAMP(3),
ADD COLUMN     "endedAt" TIMESTAMP(3),
ADD COLUMN     "estimatedHours" DOUBLE PRECISION,
ADD COLUMN     "pricePerHourPaise" INTEGER,
ADD COLUMN     "startOtp" TEXT,
ADD COLUMN     "startOtpExpiresAt" TIMESTAMP(3),
ADD COLUMN     "startedAt" TIMESTAMP(3);
