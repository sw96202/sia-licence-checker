const express = require('express');
const fileUpload = require('express-fileupload');
const path = require('path');
const { ImageAnnotatorClient } = require('@google-cloud/vision');
const Jimp = require('jimp');
const axios = require('axios');
const cheerio = require('cheerio');
const fs = require('fs');
require('dotenv').config();

const app = express();
const port = process.env.PORT || 3000;

// Set up Google Cloud Vision client
const visionClient = new ImageAnnotatorClient({
  credentials: JSON.parse(Buffer.from(process.env.GOOGLE_APPLICATION_CREDENTIALS_BASE64, 'base64').toString('utf-8')),
});

// Middleware
app.use(fileUpload());
app.use(express.static('public'));
app.set('view engine', 'ejs');
app.use(express.urlencoded({ extended: true }));

app.get('/', (req, res) => {
  res.render('upload');
});

app.post('/upload', async (req, res) => {
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
});
