async function upload() {
  const file = document.getElementById("fileInput").files[0];

  if (!file) {
    alert("Please choose a file before uploading.");
    return;
  }

  const formData = new FormData();
  formData.append("file", file);

  try {
    const response = await fetch("/upload", {
      method: "POST",
      body: formData,
    });

    const data = await response.json();

    console.log("Response:", data);

    if (!response.ok) {
      document.getElementById("normal").textContent = "Error";
      document.getElementById("table").textContent = "";
      document.getElementById("handwritten").textContent = "";
      return;
    }

    document.getElementById("normal").textContent = JSON.stringify(
      data.normal_text_data,
      null,
      2,
    );

    document.getElementById("table").textContent = JSON.stringify(
      data.table_data,
      null,
      2,
    );

    document.getElementById("handwritten").textContent = JSON.stringify(
      data.handwritten_data,
      null,
      2,
    );
  } catch (error) {
    console.error(error);

    document.getElementById("normal").textContent = "Server Error";
  }
}
