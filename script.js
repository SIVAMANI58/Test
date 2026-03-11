async function upload() {
  const file = document.getElementById("fileInput").files[0];

  const formData = new FormData();
  formData.append("file", file);

  const response = await fetch("/upload", {
    method: "POST",
    body: formData,
  });

  const data = await response.json();

  document.getElementById("output").textContent = JSON.stringify(data, null, 2);
}
