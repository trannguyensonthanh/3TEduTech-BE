// File: src/api/events/events.routes.js (Tạo file mới)

const express = require('express');
const eventController = require('./events.controller');
const { authenticate } = require('../../middlewares/auth.middleware');

const router = express.Router();

// Endpoint này yêu cầu phải đăng nhập
router.get('/subscribe', authenticate, eventController.subscribe);

module.exports = router;
