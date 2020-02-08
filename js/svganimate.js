const colors = ['#f5a147', '#51cad8', '#112b39'];
var blobs = document.querySelectorAll("#background path");
blobs.forEach(blob => {
    blob.style.fill = colors[Math.floor(Math.random() * colors.length)];
});
