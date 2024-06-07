const express = require('express');
const fileUpload = require('express-fileupload');
const path = require('path');
const axios = require('axios');
const cheerio = require('cheerio');
const { Storage } = require('@google-cloud/storage');
const vision = require('@google-cloud/vision').v1;
const Jimp = require('jimp');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(fileUpload());
app.use(express.static('public'));
app.set('view engine', 'ejs');

// Google Cloud setup
const serviceKey = path.join(__dirname, 'service-account-file.json');
const client = new vision.ImageAnnotatorClient({ keyFilename: serviceKey });
const storage = new Storage({ keyFilename: serviceKey });

// Extract text using Google Vision API
async function extractTextWithGoogleVision(filePath) {
    const [result] = await client.textDetection(filePath);
    const detections = result.textAnnotations;
    return detections[0] ? detections[0].description : '';
}

// Add watermark to image
async function addWatermark(filePath, watermarkText) {
    const image = await Jimp.read(filePath);
    const font = await Jimp.loadFont(Jimp.FONT_SANS_32_BLACK);
    image.print(font, 10, 10, watermarkText);
    await image.writeAsync(filePath);
}

// Function to scrape SIA license data
async function scrapeSIALicenses(licenseNo) {
    try {
        const response = await axios.post('https://services.sia.homeoffice.gov.uk/PublicRegister/SearchPublicRegisterByLicence', {
            licenseNo: licenseNo
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
            fullName: `${firstName} ${surname}`,
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

// Routes
app.get('/', (req, res) => {
    res.render('upload');
});

app.post('/upload', async (req, res) => {
    if (!req.files || !req.files.image) {
        return res.status(400).send('No files were uploaded.');
    }

    const imageFile = req.files.image;
    const filePath = path.join(__dirname, 'uploads', imageFile.name);

    // Use the mv() method to place the file on your server
    await imageFile.mv(filePath);

    // Extract text using Google Vision API
    const extractedText = await extractTextWithGoogleVision(filePath);
    const licenseNumber = extractedText.match(/\d{16}/g)?.[0];
    const expiryDate = extractedText.match(/(EXPIRES\s+\d{2}\s+\w+\s+\d{4})/i)?.[1];
    
    // Check the license validity and get the name from the SIA site
    let siaResponse;
    let name;
    let isValidLicence;

    if (licenseNumber) {
        siaResponse = await scrapeSIALicenses(licenseNumber.replace(/\s+/g, ''));
        isValidLicence = siaResponse.valid;
        name = siaResponse.valid ? siaResponse.fullName : 'Not Found';
    } else {
        isValidLicence = false;
        name = 'Not Found';
    }

    const watermarkText = 'Virtulum Checks';

    // Add watermark to the uploaded image
    await addWatermark(filePath, watermarkText);

    res.render('result', {
        name,
        licenseNumber: licenseNumber || 'Not Found',
        expiryDate: expiryDate || 'Not Found',
        isValidLicence,
        imageUrl: `/uploads/${imageFile.name}`
    });
});

// Start the server
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
