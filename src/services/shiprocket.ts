import axios from "axios";
import redis from "./redis";
import { prisma } from "../lib/prisma";

const SHIPROCKET_BASE_URL = "https://apiv2.shiprocket.in/v1/external";

export async function authenticate(): Promise<string> {
  const email = process.env.SHIPROCKET_EMAIL;
  const password = process.env.SHIPROCKET_PASSWORD;

  if (!email || !password) {
    throw new Error("SHIPROCKET_EMAIL and SHIPROCKET_PASSWORD must be set in environment.");
  }

  const response = await axios.post(`${SHIPROCKET_BASE_URL}/auth/login`, {
    email,
    password,
  });

  const token = response.data.token;

  // Cache JWT token in Upstash Redis
  // Key: shiprocket:token
  // TTL: 23 hours (23 * 60 * 60 = 82800 seconds)
  await redis.set("shiprocket:token", token, { ex: 82800 });

  return token;
}

export async function getToken(): Promise<string> {
  const cachedToken = await redis.get<string>("shiprocket:token");
  if (cachedToken) {
    return cachedToken;
  }

  return await authenticate();
}

// Map our Order data to Shiprocket format
export async function createShipment(orderId: string): Promise<string | null> {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: {
      address: true,
      items: {
        include: {
          variant: {
            include: {
              product: true,
            },
          },
        },
      },
    },
  });

  if (!order) {
    throw new Error(`Order ${orderId} not found`);
  }

  const token = await getToken();

  // All prices sent to Shiprocket in rupees not paise (divide by 100)
  const sub_total = order.total / 100;

  const orderItems = order.items.map((item) => ({
    name: item.variant.product.name,
    sku: item.variant.sku,
    units: item.quantity,
    selling_price: item.priceAtOrder / 100,
  }));

  const [firstName, ...lastNameParts] = order.address.name.split(" ");
  const lastName = lastNameParts.join(" ") || firstName;

  const payload = {
    order_id: order.id,
    order_date: order.createdAt.toISOString().slice(0, 10), // YYYY-MM-DD
    pickup_location: "Primary",
    billing_customer_name: firstName,
    billing_last_name: lastName,
    billing_address: order.address.line1,
    billing_address_2: order.address.line2 || "",
    billing_city: order.address.city,
    billing_pincode: order.address.pincode,
    billing_state: order.address.state,
    billing_country: "India",
    billing_email: "orders@boogiebugi.com", // Fallback email since address doesn't have it
    billing_phone: order.address.phone,
    shipping_is_billing: true,
    order_items: orderItems,
    payment_method: "Prepaid",
    sub_total,
    length: 20,
    breadth: 15,
    height: 5,
    weight: 0.5 * order.items.length, // 0.5kg per item
  };

  try {
    const response = await axios.post(`${SHIPROCKET_BASE_URL}/orders/create/adhoc`, payload, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    const awbNumber = response.data.awb_code;

    if (awbNumber) {
      await prisma.order.update({
        where: { id: order.id },
        data: { awbNumber },
      });
      return awbNumber;
    }

    return null;
  } catch (error) {
    console.error("Failed to create Shiprocket shipment:", error);
    // Don't throw, just return null so we don't break the webhook
    return null;
  }
}
