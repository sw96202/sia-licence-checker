const express = require('express');
const fileUpload = require('express-fileupload');
<<<<<<< HEAD
const { Storage } = require('@google-cloud/storage');
const vision = require('@google-cloud/vision');
const fetch = require('node-fetch');
const Jimp = require('jimp');
const path = require('path');
=======
const path = require('path');
const { ImageAnnotatorClient } = require('@google-cloud/vision');
const Jimp = require('jimp');
const axios = require('axios');
const cheerio = require('cheerio');
>>>>>>> 92da7ef238f1250068890f3f12f7a44db5fee23e
const fs = require('fs');
require('dotenv').config();

const app = express();
const port = process.env.PORT || 3000;

<<<<<<< HEAD
app.use(fileUpload());
app.set('view engine', 'ejs');
app.use(express.static('public'));

// Google Cloud Vision and Storage setup
const visionClient = new vision.ImageAnnotatorClient({
  keyFilename: process.env.GOOGLE_APPLICATION_CREDENTIALS
});

const storage = new Storage({
  keyFilename: process.env.GOOGLE_APPLICATION_CREDENTIALS
});
const bucketName = process.env.GOOGLE_CLOUD_BUCKET_NAME;

const siaCheckerUrl = 'https://www.services.sia.homeoffice.gov.uk/Pages/licence-checker.aspx';

async function extractTextWithGoogleVision(filePath) {
  try {
    const [result] = await visionClient.textDetection(filePath);
    return result.fullTextAnnotation.text;
  } catch (error) {
    console.error('Error extracting text with Google Vision:', error);
    throw error;
  }
}

function extractInformation(text) {
  const licenseNumberMatch = text.match(/\b\d{4} \d{4} \d{4} \d{4}\b/);
  const expiryDateMatch = text.match(/\b\d{2} \b[A-Z]{3}\b \d{4}/);
  const nameMatch = text.match(/Name: (.+)/);

  return {
    licenseNumber: licenseNumberMatch ? licenseNumberMatch[0] : 'Not Found',
    expiryDate: expiryDateMatch ? expiryDateMatch[0] : 'Not Found',
    name: nameMatch ? nameMatch[1] : 'Not Found'
  };
}

async function checkLicense(licenseNumber) {
  try {
    const response = await fetch(`${siaCheckerUrl}?licenceNumber=${licenseNumber}`);
    const data = await response.text();
    return data.includes('Licence is active'); // Update this according to the actual response
  } catch (error) {
    console.error('Error checking license:', error);
    return false;
  }
}
=======
// Set up Google Cloud Vision client
const visionClient = new ImageAnnotatorClient({
  credentials: JSON.parse(Buffer.from(process.env.GOOGLE_APPLICATION_CREDENTIALS_BASE64, 'base64').toString('utf-8')),
});

// Middleware
app.use(fileUpload());
app.use(express.static('public'));
app.set('view engine', 'ejs');
app.use(express.urlencoded({ extended: true }));
>>>>>>> 92da7ef238f1250068890f3f12f7a44db5fee23e

app.get('/', (req, res) => {
  res.render('upload');
});

app.post('/upload', async (req, res) => {
<<<<<<< HEAD
  if (!req.files || Object.keys(req.files).length === 0) {
    return res.status(400).send('No files were uploaded.');
  }

  const uploadedFile = req.files.image;
  const filePath = path.join(__dirname, 'uploads', uploadedFile.name);

  try {
    await uploadedFile.mv(filePath);
    const extractedText = await extractTextWithGoogleVision(filePath);
    const info = extractInformation(extractedText);

    const isValid = await checkLicense(info.licenseNumber);

    const image = await Jimp.read(filePath);
    const watermark = await Jimp.read('public/watermark.png');
    image.composite(watermark, 0, 0, {
      mode: Jimp.BLEND_SOURCE_OVER,
      opacitySource: 0.5
    });

    const watermarkedImagePath = path.join(__dirname, 'uploads', 'watermarked_' + uploadedFile.name);
    await image.writeAsync(watermarkedImagePath);

    res.render('result', {
      info,
      isValid,
      imagePath: '/uploads/' + uploadedFile.name,
      watermarkedImagePath: '/uploads/watermarked_' + uploadedFile.name
    });
  } catch (error) {
    console.error('Error during file upload or processing:', error);
    res.status(500).send('Internal Server Error');
  }
});

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
=======
  if (!req.files || !req.files.image) {
    return res.status(400).send('No files were uploaded.');
  }

  const file = req.files.image;
  const filePath = path.join(__dirname, 'uploads', file.name);

  // Save the file
  await file.mv(filePath);

  // Process the file with Google Cloud Vision
  const [result] = await visionClient.textDetection(filePath);
  const detections = result.textAnnotations;
  const extractedText = detections.length > 0 ? detections[0].description : 'No text found';

  // Extract License Number, Expiry Date, and Name
  const licenseNumberRegex = /\b\d{4} \d{4} \d{4} \d{4}\b/;
  const expiryDateRegex = /\b\d{2} \w{3} \d{4}\b/;
  const nameRegex = /[A-Z]\. [A-Z][a-z]+/;

  const licenseNumberMatch = extractedText.match(licenseNumberRegex);
  const expiryDateMatch = extractedText.match(expiryDateRegex);
  const nameMatch = extractedText.match(nameRegex);

  const licenseNumber = licenseNumberMatch ? licenseNumberMatch[0] : 'Not Found';
  const expiryDate = expiryDateMatch ? expiryDateMatch[0] : 'Not Found';
  const name = nameMatch ? nameMatch[0] : 'Not Found';

  // Check SIA License validity
  let isValidLicense = false;
  if (licenseNumber !== 'Not Found') {
    const siaUrl = `https://www.services.sia.homeoffice.gov.uk/Pages/licence-lookup.aspx?LicenceNumber=${licenseNumber.replace(/\s/g, '')}`;
    const siaResponse = await axios.get(siaUrl);
    const $ = cheerio.load(siaResponse.data);
    isValidLicense = $('#ctl00_PlaceHolderMain_PageContent_licenceDetails_status').text().trim() === 'Active';
  }

  // Add watermark
  const watermarkText = 'Virtulum Checks';
  const image = await Jimp.read(filePath);
  const font = await Jimp.loadFont(Jimp.FONT_SANS_32_WHITE);
  image.print(font, 10, 10, watermarkText);
  const watermarkedFilePath = path.join(__dirname, 'uploads', 'watermarked_' + file.name);
  await image.writeAsync(watermarkedFilePath);

  // Render result
  res.render('result', {
    licenseNumber,
    expiryDate,
    name,
    isValidLicense,
    imagePath: '/uploads/watermarked_' + file.name
  });
});

app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
>>>>>>> 92da7ef238f1250068890f3f12f7a44db5fee23e
});
