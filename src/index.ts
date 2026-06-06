import "dotenv/config";
import app from "./app";

const PORT = process.env.PORT || 8080;

app.listen(PORT, () => {
  console.error(`BOOGIEBUGI API running on http://localhost:${PORT}`);
  console.error(`Environment: ${process.env.NODE_ENV || "development"}`);
});
