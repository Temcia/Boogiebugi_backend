import express from "express";
import { z } from "zod";
import { validateQuery } from "./src/middleware/validate";

const app = express();

const schema = z.object({
  page: z.coerce.number().default(1),
});

app.get("/test", validateQuery(schema), (req, res) => {
  res.json({ query: req.query });
});

app.listen(3005, () => {
  console.log("Started on 3005");
});
