import prisma from '../src/lib/prisma';
import bcrypt from 'bcryptjs';

/* =========================================================
   DEMO CONFIGURATION
========================================================= */

const OWNER_EMAIL = 'owner@serviceos.local';
const OWNER_PASSWORD = 'password123';

const TENANT_SLUG = 'zain-tailors';

/* =========================================================
   PERMISSIONS
========================================================= */

const permissionNames = [
  'analytics.read',

  'customers.read',
  'customers.create',
  'customers.update',
  'customers.delete',

  'services.read',
  'services.create',
  'services.update',
  'services.delete',

  'bookings.read',
  'bookings.create',
  'bookings.update',
  'bookings.delete',

  'orders.read',
  'orders.create',
  'orders.update',
  'orders.delete',

  'staff.read',
  'staff.create',
  'staff.update',
  'staff.delete',

  'invoices.read',
  'invoices.create',
  'invoices.update',
  'invoices.delete',

  'payments.read',
  'payments.create',
  'payments.update',
  'payments.delete',

  'tailoring.read',
  'tailoring.create',
  'tailoring.update',
  'tailoring.delete',

  'settings.manage',
];

/* =========================================================
   DEMO SERVICES
========================================================= */

const demoServices = [
  {
    name: 'Shalwar Kameez',
    description:
      'Traditional outfit with customization.',
    price: 3500,
    duration: 60,
    status: 'active',
    requiresBooking: true,
    requiresDelivery: true,
  },

  {
    name: 'Suit',
    description:
      'Formal suit with measurements.',
    price: 12000,
    duration: 90,
    status: 'active',
    requiresBooking: true,
    requiresDelivery: true,
  },

  {
    name: 'Kurta',
    description:
      'Standard or custom kurta.',
    price: 2800,
    duration: 45,
    status: 'active',
    requiresBooking: true,
    requiresDelivery: true,
  },
];

/* =========================================================
   MEASUREMENT FIELDS
========================================================= */

const measurementFields = [
  {
    name: 'height',
    label: 'Height',
    type: 'number',
    isCustom: false,
    sortOrder: 1,
  },

  {
    name: 'shoulder',
    label: 'Shoulder',
    type: 'number',
    isCustom: false,
    sortOrder: 2,
  },

  {
    name: 'chest',
    label: 'Chest',
    type: 'number',
    isCustom: false,
    sortOrder: 3,
  },

  {
    name: 'waist',
    label: 'Waist',
    type: 'number',
    isCustom: false,
    sortOrder: 4,
  },

  {
    name: 'sleeve',
    label: 'Sleeve',
    type: 'number',
    isCustom: false,
    sortOrder: 5,
  },
];

/* =========================================================
   MAIN SEED
========================================================= */

async function main() {
  console.log('');
  console.log('======================================');
  console.log('ServiceOS database seed');
  console.log('======================================');

  /* =======================================================
     1. OWNER USER
  ======================================================= */

  console.log('Creating/updating demo owner...');

  const passwordHash =
    await bcrypt.hash(OWNER_PASSWORD, 12);

  const user = await prisma.user.upsert({
    where: {
      email: OWNER_EMAIL,
    },

    update: {
      name: 'Zain Ullah',
      phone: '+92 300 1234567',
      status: 'active',
      emailVerified: true,

      /*
       * Keep the demo password predictable when reseeding
       * development environments.
       */
      passwordHash,
    },

    create: {
      name: 'Zain Ullah',
      email: OWNER_EMAIL,
      phone: '+92 300 1234567',
      passwordHash,
      status: 'active',
      emailVerified: true,
    },
  });

  console.log(`Owner ready: ${user.email}`);

  /* =======================================================
     2. TENANT
  ======================================================= */

  console.log('Creating/updating Zain Tailors...');

  const tenant = await prisma.tenant.upsert({
    where: {
      slug: TENANT_SLUG,
    },

    update: {
      name: 'Zain Tailors',
      businessType: 'tailoring',
      phone: '+92 300 1234567',
      email: 'shop@zain-tailors.com',
      address: 'Main Bazaar, Mardan',
      city: 'Mardan',
      country: 'Pakistan',
      currency: 'PKR',
      timezone: 'Asia/Karachi',
      status: 'active',
    },

    create: {
      name: 'Zain Tailors',
      slug: TENANT_SLUG,
      businessType: 'tailoring',
      logoUrl: null,
      phone: '+92 300 1234567',
      email: 'shop@zain-tailors.com',
      address: 'Main Bazaar, Mardan',
      city: 'Mardan',
      country: 'Pakistan',
      currency: 'PKR',
      timezone: 'Asia/Karachi',
      status: 'active',
    },
  });

  console.log(`Tenant ready: ${tenant.name}`);

  /* =======================================================
     3. PERMISSIONS
  ======================================================= */

  console.log('Creating/updating permissions...');

  const permissions = [];

  for (const permissionName of permissionNames) {
    const permission =
      await prisma.permission.upsert({
        where: {
          name: permissionName,
        },

        update: {
          description:
            `Allows ${permissionName}`,
        },

        create: {
          name: permissionName,
          description:
            `Allows ${permissionName}`,
        },
      });

    permissions.push(permission);
  }

  console.log(
    `${permissions.length} permissions ready.`,
  );

  /* =======================================================
     4. OWNER ROLE
  ======================================================= */

  console.log('Creating/updating Owner role...');

  const ownerRole = await prisma.role.upsert({
    where: {
      tenantId_name: {
        tenantId: tenant.id,
        name: 'Owner',
      },
    },

    update: {
      description:
        'Business owner with full administrative access',
    },

    create: {
      tenantId: tenant.id,
      name: 'Owner',
      description:
        'Business owner with full administrative access',
    },
  });

  console.log(`Owner role ready: ${ownerRole.id}`);

  /* =======================================================
     5. ROLE PERMISSIONS
  ======================================================= */

  console.log(
    'Assigning permissions to Owner role...',
  );

  await prisma.rolePermission.createMany({
    data: permissions.map((permission) => ({
      roleId: ownerRole.id,
      permissionId: permission.id,
    })),

    skipDuplicates: true,
  });

  /* =======================================================
     6. TENANT MEMBERSHIP
  ======================================================= */

  console.log(
    'Assigning owner to Zain Tailors...',
  );

  await prisma.tenantUser.upsert({
    where: {
      tenantId_userId: {
        tenantId: tenant.id,
        userId: user.id,
      },
    },

    update: {
      roleId: ownerRole.id,
      status: 'active',
    },

    create: {
      tenantId: tenant.id,
      userId: user.id,
      roleId: ownerRole.id,
      status: 'active',
    },
  });

  /* =======================================================
     7. SERVICES
  ======================================================= */

  console.log('Creating/updating services...');

  for (const serviceData of demoServices) {
    const existingService =
      await prisma.service.findFirst({
        where: {
          tenantId: tenant.id,
          name: serviceData.name,
        },
      });

    if (existingService) {
      await prisma.service.update({
        where: {
          id: existingService.id,
        },

        data: {
          description:
            serviceData.description,
          price: serviceData.price,
          duration: serviceData.duration,
          status: serviceData.status,
          requiresBooking:
            serviceData.requiresBooking,
          requiresDelivery:
            serviceData.requiresDelivery,
        },
      });
    } else {
      await prisma.service.create({
        data: {
          tenantId: tenant.id,
          ...serviceData,
        },
      });
    }
  }

  console.log(
    `${demoServices.length} demo services ready.`,
  );

  /* =======================================================
     8. MEASUREMENT FIELDS
  ======================================================= */

  console.log(
    'Creating/updating measurement fields...',
  );

  for (const fieldData of measurementFields) {
    const existingField =
      await prisma.measurementField.findFirst({
        where: {
          tenantId: tenant.id,
          name: fieldData.name,
        },
      });

    if (existingField) {
      await prisma.measurementField.update({
        where: {
          id: existingField.id,
        },

        data: {
          label: fieldData.label,
          type: fieldData.type,
          isCustom: fieldData.isCustom,
          sortOrder: fieldData.sortOrder,
        },
      });
    } else {
      await prisma.measurementField.create({
        data: {
          tenantId: tenant.id,
          ...fieldData,
        },
      });
    }
  }

  console.log(
    `${measurementFields.length} measurement fields ready.`,
  );

  /* =======================================================
     9. VERIFY RBAC
  ======================================================= */

  const membership =
    await prisma.tenantUser.findUnique({
      where: {
        tenantId_userId: {
          tenantId: tenant.id,
          userId: user.id,
        },
      },

      include: {
        role: {
          include: {
            rolePermissions: {
              include: {
                permission: true,
              },
            },
          },
        },
      },
    });

  if (!membership?.role) {
    throw new Error(
      'Seed verification failed: Owner role was not assigned.',
    );
  }

  /* =======================================================
     COMPLETE
  ======================================================= */

  console.log('');
  console.log('======================================');
  console.log('ServiceOS seed complete');
  console.log('======================================');
  console.log(`Tenant: ${tenant.name}`);
  console.log(`Owner: ${user.email}`);
  console.log(`Role: ${membership.role.name}`);
  console.log(
    `Permissions: ${membership.role.rolePermissions.length}`,
  );
  console.log(
    `Services: ${demoServices.length}`,
  );
  console.log(
    `Measurement fields: ${measurementFields.length}`,
  );
  console.log('======================================');
  console.log('');
}

/* =========================================================
   EXECUTE
========================================================= */

main()
  .catch((error) => {
    console.error('');
    console.error('Seed failed:');
    console.error(error);

    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });