const express = require('express');
const fileUpload = require('express-fileupload');
const vision = require('@google-cloud/vision');
const path = require('path');
const axios = require('axios');
const cheerio = require('cheerio');
const sharp = require('sharp');
const fs = require('fs');

require('dotenv').config();

const app = express();
const port = process.env.PORT || 10000;

// Ensure uploads directory exists
if (!fs.existsSync(path.join(__dirname, 'uploads'))) {
  fs.mkdirSync(path.join(__dirname, 'uploads'));
}

// Google Cloud setup
const serviceKey = path.join(__dirname, process.env.GOOGLE_APPLICATION_CREDENTIALS);

const client = new vision.ImageAnnotatorClient({
  keyFilename: serviceKey,
});

app.use(express.static('public'));
app.use(fileUpload());
app.set('view engine', 'ejs');

// Function to scrape SIA license data
async function scrapeSIALicenses(licenseNo) {
  try {
    const response = await axios.post('https://services.sia.homeoffice.gov.uk/PublicRegister/SearchPublicRegisterByLicence', {
      licenseNo: licenseNo.replace(/\s/g, '') // Remove spaces
    });

    const $ = cheerio.load(response.data);

    const firstName = $('.ax_paragraph').eq(0).next().find('.ax_h5').text().trim();
    const surname = $('.ax_paragraph').eq(1).next().find('.ax_h5').text().trim();
    const licenseNumber = $('.ax_paragraph').eq(2).next().find('.ax_h4').text().trim();
    const role = $('.ax_paragraph').eq(3).next().find('.ax_h4').text().trim();
    
    const expiryDate = $('.ax_paragraph:contains("Expiry date")').next().find('.ax_h4').text().trim();
    const status = $('.ax_paragraph:contains("Status")').next().find('.ax_h4_green').text().trim();

    if (!firstName || !surname || !licenseNumber || !role || !expiryDate || !status) {
      return { valid: false };
    }

    return {
      valid: true,
      firstName,
      surname,
      licenseNumber,
      role,
      expiryDate,
      status
    };
  } catch (error) {
    console.error('Error scraping SIA website:', error);
    return { valid: false };
  }
}

app.get('/', (req, res) => {
  res.render('upload');
});

app.post('/', async (req, res) => {
  if (!req.files || !req.files.image) {
    return res.status(400).send('No files were uploaded.');
  }

  const image = req.files.image;
  const imagePath = path.join(__dirname, 'uploads', image.name);

  try {
    await image.mv(imagePath);
  } catch (err) {
    return res.status(500).send('Error saving the file.');
  }

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

  const nameMatch = extractedText.match(/(?:[A-Z]\.\s*)?[A-Z][a-z]+(?:\s+[A-Z][a-z]+)?/);
  if (nameMatch) {
    name = nameMatch[0];
  }

  const licenseInfo = await scrapeSIALicenses(licenseNumber);

  const isValidLicence = licenseInfo.valid;

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

app.listen(port, () => {
  console.log(`Server started on port ${port}`);
});
