import fetch from "node-fetch";

async function run() {
  const res = await fetch("http://localhost:8080/api/products");
  const text = await res.text();
  console.log("Status:", res.status);
  console.log("Response:", text);
}
run();
