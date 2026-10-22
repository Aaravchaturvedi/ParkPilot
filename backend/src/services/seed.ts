import { Role, KycStatus, VehicleCategory } from '@prisma/client';
import bcrypt from 'bcryptjs';
import prisma from '../lib/prisma';

export async function autoSeed(retries = 5, delayMs = 2000): Promise<void> {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const password = 'Password123';
      const passwordHash = await bcrypt.hash(password, 10);

      // 1. Seed Customers
      const customers = [
        { email: 'customer1@gmail.com', name: 'Customer 1', phone: '+919800000001' },
        { email: 'customer2@gmail.com', name: 'Customer 2', phone: '+919800000002' },
        { email: 'customer3@gmail.com', name: 'Customer 3', phone: '+919800000003' },
      ];

      for (const c of customers) {
        await prisma.user.upsert({
          where: { email: c.email },
          update: {
            name: c.name,
            passwordHash,
            role: Role.CUSTOMER,
            kycStatus: KycStatus.VERIFIED,
          },
          create: {
            email: c.email,
            name: c.name,
            phone: c.phone,
            passwordHash,
            role: Role.CUSTOMER,
            kycStatus: KycStatus.VERIFIED,
          },
        });
      }

      // 2. Seed Partners
      const partners = [
        {
          email: 'partner1@gmail.com',
          name: 'Partner 1',
          phone: '+919900000001',
          vehicle: { plate: 'DL 01 AB 1111', make: 'Hyundai', model: 'i20', category: VehicleCategory.HATCHBACK },
        },
        {
          email: 'partner2@gmail.com',
          name: 'Partner 2',
          phone: '+919900000002',
          vehicle: { plate: 'DL 02 CD 2222', make: 'Honda', model: 'City', category: VehicleCategory.SEDAN },
        },
        {
          email: 'partner3@gmail.com',
          name: 'Partner 3',
          phone: '+919900000003',
          vehicle: { plate: 'DL 03 EF 3333', make: 'Tata', model: 'Harrier', category: VehicleCategory.SUV },
        },
      ];

      for (const p of partners) {
        const user = await prisma.user.upsert({
          where: { email: p.email },
          update: {
            name: p.name,
            passwordHash,
            role: Role.PARTNER,
            kycStatus: KycStatus.VERIFIED,
          },
          create: {
            email: p.email,
            name: p.name,
            phone: p.phone,
            passwordHash,
            role: Role.PARTNER,
            kycStatus: KycStatus.VERIFIED,
          },
        });

        await prisma.vehicle.upsert({
          where: { plateNumber: p.vehicle.plate },
          update: {
            ownerId: user.id,
            make: p.vehicle.make,
            model: p.vehicle.model,
            category: p.vehicle.category,
            isActive: true,
          },
          create: {
            ownerId: user.id,
            plateNumber: p.vehicle.plate,
            make: p.vehicle.make,
            model: p.vehicle.model,
            category: p.vehicle.category,
            isActive: true,
          },
        });
      }

      // 3. Seed a sample parking space owned by partner1
      const partner1 = await prisma.user.findUnique({ where: { email: 'partner1@gmail.com' } });
      if (partner1) {
        const existingSpace = await prisma.parkingSpace.findFirst({
          where: { ownerId: partner1.id, title: 'Central Mall Secure Parking' },
        });
        if (!existingSpace) {
          await prisma.parkingSpace.create({
            data: {
              ownerId: partner1.id,
              title: 'Central Mall Secure Parking',
              address: 'Connaught Place, Block B, New Delhi',
              lat: 28.6315,
              lng: 77.2167,
              pricePerHourPaise: 5000,
              isActive: true,
            },
          });
        }
      }

      console.log('✅ [seed] Test accounts auto-seeded (customer1..3, partner1..3 pw: Password123)');
      return;
    } catch (err) {
      console.warn(`⚠️ [seed] Auto-seed attempt ${attempt}/${retries} failed:`, (err as Error).message);
      if (attempt < retries) {
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      } else {
        console.error('❌ [seed] Auto-seed could not connect to database after all retries.');
      }
    }
  }
}
