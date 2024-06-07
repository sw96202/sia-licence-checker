const express = require('express');
const fileUpload = require('express-fileupload');
const { Storage } = require('@google-cloud/storage');
const vision = require('@google-cloud/vision');
const fetch = require('node-fetch');
const Jimp = require('jimp');
const path = require('path');
const fs = require('fs');
require('dotenv').config();

const app = express();
const port = process.env.PORT || 3000;

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

app.get('/', (req, res) => {
  res.render('upload');
});

app.post('/upload', async (req, res) => {
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
});
