const express = require("express");
const multer = require("multer");
const cors = require("cors");
const fetch = (...args) =>
  import("node-fetch").then(({ default: fetch }) => fetch(...args));

const app = express();
const upload = multer();

app.use(cors());
app.use(express.static("public"));

app.post("/upload", upload.single("file"), async (req, res) => {
  const formData = new FormData();
  formData.append("file", new Blob([req.file.buffer]), req.file.originalname);

  const response = await fetch("http://127.0.0.1:8000/extract", {
    method: "POST",
    body: formData,
  });

  const data = await response.json();

  res.json(data);
});

app.listen(3000, () => {
  console.log("Frontend running on http://localhost:3000");
});
