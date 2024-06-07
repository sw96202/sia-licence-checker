const express = require('express');
const app = express();
const axios = require('axios');
const multer = require('multer');
const { Storage } = require('@google-cloud/storage');
const vision = require('@google-cloud/vision');
const path = require('path');
const ejs = require('ejs');
const PORT = process.env.PORT || 3000;

// Google Cloud setup
const serviceKey = path.join(__dirname, 'C:\Users\Shadow\Downloads\excellent-zoo-319912-02dc266c5423.json');

const storage = new Storage({
  keyFilename: serviceKey,
  projectId: 'excellent-zoo-319912',
});

const client = new vision.ImageAnnotatorClient({
  keyFilename: serviceKey,
});

// Middleware
app.set('view engine', 'ejs');
app.use(express.static('public'));
app.use(express.urlencoded({ extended: true }));

// Multer setup for file upload
const upload = multer({ dest: 'uploads/' });

app.get('/', (req, res) => {
  res.render('upload');
});

app.post('/upload', upload.single('image'), async (req, res) => {
  const file = req.file;
  if (!file) {
    return res.status(400).send('No file uploaded.');
  }

  const filePath = path.join(__dirname, file.path);

  try {
    const [result] = await client.textDetection(filePath);
    const detections = result.textAnnotations;

    const licenceNumber = detections[0].description.match(/\b\d{4} \d{4} \d{4} \d{4}\b/);
    const expiryDate = detections[0].description.match(/\b\d{2} \w{3} \d{4}\b/);
    const name = detections[0].description.match(/[A-Z]+\. [A-Z]+/);

    const isValid = await checkSIALicence(licenceNumber);

    res.render('result', {
      licenceNumber: licenceNumber ? licenceNumber[0] : 'Not Found',
      expiryDate: expiryDate ? expiryDate[0] : 'Not Found',
      name: name ? name[0] : 'Not Found',
      isValid,
      imagePath: `uploads/${file.filename}`,
    });
  } catch (error) {
    console.error(error);
    res.status(500).send('Error processing image.');
  }
});

async function checkSIALicence(licenceNumber) {
  // Implement the SIA licence checker logic here using axios
  // For example:
  try {
    const response = await axios.get(`https://sia-checker-url.com?licence=${licenceNumber}`);
    return response.data.isValid; // Assuming the API returns { isValid: true/false }
  } catch (error) {
    console.error(error);
    return false;
  }
}

app.listen(PORT, () => {
  console.log(`Server started on port ${PORT}`);
});

