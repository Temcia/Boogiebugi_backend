import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const categories = [
  {
    name: "Men",
    slug: "men",
    children: [
      { name: "Tops", slug: "men-tops" },
      { name: "Bottoms", slug: "men-bottoms" },
      { name: "Outerwear", slug: "men-outerwear" },
      { name: "Formals", slug: "men-formals" },
      { name: "Accessories", slug: "men-accessories" },
    ],
  },
  {
    name: "Women",
    slug: "women",
    children: [
      { name: "Tops", slug: "women-tops" },
      { name: "Bottoms", slug: "women-bottoms" },
      { name: "Dresses", slug: "women-dresses" },
      { name: "Outerwear", slug: "women-outerwear" },
      { name: "Festive", slug: "women-festive" },
      { name: "Accessories", slug: "women-accessories" },
    ],
  },
  {
    name: "Kids",
    slug: "kids",
    children: [
      { name: "Boys", slug: "kids-boys" },
      { name: "Girls", slug: "kids-girls" },
      { name: "Infants", slug: "kids-infants" },
    ],
  },
  {
    name: "Sale",
    slug: "sale",
    children: [],
  },
];

async function main() {
  console.error("Seeding categories...");

  for (const cat of categories) {
    const parent = await prisma.category.upsert({
      where: { slug: cat.slug },
      update: { name: cat.name },
      create: { name: cat.name, slug: cat.slug },
    });

    console.error(`  [ok] ${parent.name} (${parent.slug})`);

    for (const child of cat.children) {
      const sub = await prisma.category.upsert({
        where: { slug: child.slug },
        update: { name: child.name },
        create: {
          name: child.name,
          slug: child.slug,
          parentId: parent.id,
        },
      });

      console.error(`    [ok] ${sub.name} (${sub.slug})`);
    }
  }

  console.error("\nSeeding complete.");
}

main()
  .catch((e) => {
    console.error("Seed failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
