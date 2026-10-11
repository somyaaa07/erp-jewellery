// routes/uploadRoutes.js
// POST /api/uploads/image  (multipart, field "image")
// Saves one jewellery photo on the server and returns its stable URL. The caller stores that URL
// on the design (default_image_url) or on a tray piece (image_url). Users never type a URL.
import express from 'express';
import multer from 'multer';
import auth from '../middlewares/auth.js';
import tenantScope from '../middlewares/tenantScope.js';
import rbac from '../middlewares/rbac.js';
import upload from '../middlewares/upload.js';

const router = express.Router();
router.use(auth, tenantScope);

router.post('/image', rbac('INVENTORY_EDIT'), (req, res) => {
  upload.single('image')(req, res, (err) => {
    if (err instanceof multer.MulterError) {
      const message = err.code === 'LIMIT_FILE_SIZE' ? 'The image is larger than 5 MB.' : `Upload failed: ${err.message}`;
      return res.status(400).json({ error: message });
    }
    if (err) return res.status(400).json({ error: err.message });
    if (!req.file) return res.status(400).json({ error: 'Choose an image to upload.' });
    return res.status(201).json({ url: `/uploads/items/${req.file.filename}` });
  });
});

export default router;
