import { prisma } from "./src/lib/prisma";
async function run() {
  try {
    const products = await prisma.product.findMany({
      where: { isActive: true },
      orderBy: { createdAt: "desc" },
      skip: 0,
      take: 20,
      include: { variants: true, category: true },
    });
    console.log(products);
  } catch (e) {
    console.error(e);
  }
}
run();
