const express = require('express');
const fileUpload = require('express-fileupload');
const vision = require('@google-cloud/vision');
const path = require('path');
const axios = require('axios');
const sharp = require('sharp');
const { Storage } = require('@google-cloud/storage');
const fs = require('fs');
const cheerio = require('cheerio');

require('dotenv').config();

const app = express();
const port = process.env.PORT || 10000;

// Google Cloud setup
const serviceKey = path.join(__dirname, 'excellent-zoo-319912-02dc266c5423.json');

const client = new vision.ImageAnnotatorClient({
  keyFilename: serviceKey,
});

const storage = new Storage({
  keyFilename: serviceKey,
});

app.use(express.static('public'));
app.use(fileUpload());
app.set('view engine', 'ejs');

app.get('/', (req, res) => {
  res.render('upload');
});

app.post('/', async (req, res) => {
  if (!req.files || !req.files.image) {
    return res.status(400).send('No files were uploaded.');
  }

  const image = req.files.image;
  const imagePath = path.join(__dirname, 'uploads', image.name);

  await image.mv(imagePath);

  const [result] = await client.textDetection(imagePath);
  const detections = result.textAnnotations;
  const extractedText = detections.length > 0 ? detections[0].description : '';

  let licenseNumber = 'Not Found';
  let expiryDate = 'Not Found';
  let name = 'Not Found';

  const licenseNumberMatch = extractedText.match(/\b\d{4} \d{4} \d{4} \d{4}\b/);
  if (licenseNumberMatch) {
    licenseNumber = licenseNumberMatch[0];
  }

  const expiryDateMatch = extractedText.match(/\b\d{2} \b[A-Z]{3}\b \d{4}\b/);
  if (expiryDateMatch) {
    expiryDate = expiryDateMatch[0];
  }

  const nameMatch = extractedText.match(/\bH\. [A-Z]+\b/);
  if (nameMatch) {
    name = nameMatch[0];
  }

  // Scrape SIA website for license validation
  let isValidLicence = false;
  try {
    const siaResponse = await checkSIALicense(licenseNumber);
    if (siaResponse) {
      isValidLicence = true;
    }
  } catch (error) {
    console.error('Error checking SIA license:', error);
  }

  // Add watermark to the image
  const watermarkedImagePath = path.join(__dirname, 'uploads', `watermarked_${image.name}`);
  await sharp(imagePath)
    .composite([{ input: Buffer.from('<svg><text x="10" y="50" font-size="30" fill="white">Virtulum Checks</text></svg>'), gravity: 'southeast' }])
    .toFile(watermarkedImagePath);

  res.render('result', {
    licenseNumber,
    expiryDate,
    name,
    isValidLicence,
    imageUrl: `/uploads/watermarked_${image.name}`
  });
});

// Function to check SIA license validity
async function checkSIALicense(licenseNumber) {
  const response = await axios.get(`https://www.services.sia.homeoffice.gov.uk/Pages/licence-checker.aspx?licenceNumber=${licenseNumber}`);
  const $ = cheerio.load(response.data);

  const status = $('#content .status').text().trim();
  return status === 'Active';
}

app.listen(port, () => {
  console.log(`Server started on port ${port}`);
});
