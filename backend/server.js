// backend/server.js
const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// Load environment variables
require('dotenv').config();

// ================================================================
// 📌 CÀI ĐẶT (Settings)
// ================================================================
const SETTINGS = {
    EXPIRE_TIME_MINUTES: 100,
    WHITELIST_IPS: ['14.162.99.92'],
    KEY_PREFIX: 'AuraHub',
    ACCESS_KEY_PREFIX: 'AuraHub-Access',
    MAX_LOGS: null,
    ONE_KEY_PER_IP: true,
    DEBUG: true,
    API_SECRET_KEY: process.env.API_SECRET_KEY || 'default-secret-key-change-me',
    SERVE_HTML: true,
    ALLOWED_REFERRERS: [
        'https://onthitracnghiem.com'
    ],
    ALLOWED_DOMAIN: 'https://api-key-manager-5y84.onrender.com'
};

// ================================================================
// KHỞI TẠO TỪ SETTINGS
// ================================================================
const EXPIRE_TIME = SETTINGS.EXPIRE_TIME_MINUTES * 60 * 1000;
const WHITELIST_IPS = SETTINGS.WHITELIST_IPS;
const KEY_PREFIX = SETTINGS.KEY_PREFIX;
const ACCESS_KEY_PREFIX = SETTINGS.ACCESS_KEY_PREFIX;
const MAX_LOGS = SETTINGS.MAX_LOGS;
const ONE_KEY_PER_IP = SETTINGS.ONE_KEY_PER_IP;
const DEBUG = SETTINGS.DEBUG;
const API_SECRET = SETTINGS.API_SECRET_KEY;
const SERVE_HTML = SETTINGS.SERVE_HTML;
const ALLOWED_REFERRERS = SETTINGS.ALLOWED_REFERRERS;
const ALLOWED_DOMAIN = SETTINGS.ALLOWED_DOMAIN;

const app = express();
const PORT = process.env.PORT || 3000;
const NODE_ENV = process.env.NODE_ENV || 'development';

// ================================================================
// CORS CONFIG
// ================================================================
app.use(cors({
    origin: function (origin, callback) {
        if (!origin) return callback(null, true);
        if (origin === ALLOWED_DOMAIN || origin === 'http://localhost:3000' || origin === 'http://localhost:5500') {
            callback(null, true);
        } else {
            if (DEBUG) console.log(`⛔ CORS blocked: ${origin}`);
            callback(new Error('Not allowed by CORS'));
        }
    },
    credentials: true
}));

app.use(express.json());

// ================================================================
// HÀM KIỂM TRA IP WHITELIST
// ================================================================
function isWhitelisted(ip) {
    return WHITELIST_IPS.includes(ip);
}

// ================================================================
// PHỤC VỤ FILE HTML - PHẦN ĐÃ ĐƯỢC SỬA LỖI
// ================================================================
if (SERVE_HTML) {
    // Đường dẫn đến thư mục frontend
    const frontendPath = path.join(__dirname, '../frontend');
    
    // Middleware kiểm tra referrer cho HTML
    function checkHtmlReferrer(req, res, next) {
        // Bỏ qua các route API
        if (req.path.startsWith('/api/')) {
            return next();
        }
        
        // Cho phép tất cả truy cập HTML (không chặn)
        // Backend sẽ xử lý referrer ở frontend nếu cần
        return next();
    }
    
    // Áp dụng middleware
    app.use(checkHtmlReferrer);
    
    // Kiểm tra thư mục frontend có tồn tại không
    if (fs.existsSync(frontendPath)) {
        // Phục vụ file tĩnh từ thư mục frontend
        app.use(express.static(frontendPath));
        
        // Route cho /index.html
        app.get('/index.html', (req, res) => {
            const indexPath = path.join(frontendPath, 'index.html');
            if (fs.existsSync(indexPath)) {
                res.sendFile(indexPath);
            } else {
                res.status(404).json({ 
                    success: false, 
                    message: 'index.html not found' 
                });
            }
        });
        
        // Route mặc định cho /
        app.get('/', (req, res) => {
            const indexPath = path.join(frontendPath, 'index.html');
            if (fs.existsSync(indexPath)) {
                res.sendFile(indexPath);
            } else {
                // Nếu không có index.html, trả về JSON
                res.json({
                    message: '🚀 API Key Manager is running!',
                    version: '1.0.0',
                    status: 'online',
                    environment: NODE_ENV,
                    config: {
                        expire_time: `${EXPIRE_TIME/60000} minutes`,
                        max_logs: MAX_LOGS || 'unlimited',
                        one_key_per_ip: ONE_KEY_PER_IP,
                        key_format: `${KEY_PREFIX}-xxxxxxxxxxxxxxxx`,
                        access_key_format: `${ACCESS_KEY_PREFIX}-[80 ký tự hỗn hợp + timestamp]`
                    },
                    endpoints: {
                        root: '/',
                        health: '/api/health',
                        logs: '/api/logs',
                        keys: '/api/keys',
                        access: '/api/access (GET)',
                        request: '/api/request (GET - cần access key)',
                        stats: '/api/stats',
                        html: '/index.html'
                    },
                    timestamp: new Date().toISOString()
                });
            }
        });
        
        if (DEBUG) console.log(`📁 Phục vụ file HTML từ: ${frontendPath}`);
    } else {
        if (DEBUG) console.log(`⚠️ Thư mục frontend không tồn tại: ${frontendPath}`);
        
        // Route fallback nếu không có frontend
        app.get('/', (req, res) => {
            res.json({
                message: '🚀 API Key Manager is running!',
                version: '1.0.0',
                status: 'online',
                environment: NODE_ENV,
                config: {
                    expire_time: `${EXPIRE_TIME/60000} minutes`,
                    max_logs: MAX_LOGS || 'unlimited',
                    one_key_per_ip: ONE_KEY_PER_IP,
                    key_format: `${KEY_PREFIX}-xxxxxxxxxxxxxxxx`,
                    access_key_format: `${ACCESS_KEY_PREFIX}-[80 ký tự hỗn hợp + timestamp]`
                },
                endpoints: {
                    root: '/',
                    health: '/api/health',
                    logs: '/api/logs',
                    keys: '/api/keys',
                    access: '/api/access (GET)',
                    request: '/api/request (GET - cần access key)',
                    stats: '/api/stats'
                },
                note: 'Frontend folder not found. Please add frontend/index.html',
                timestamp: new Date().toISOString()
            });
        });
    }
}

// ================================================================
// FILE OPERATIONS
// ================================================================
const LOG_FILE = path.join(__dirname, 'ip-logs.json');
const ACCESS_FILE = path.join(__dirname, 'access-keys.json');

function readLogs() {
    try {
        if (fs.existsSync(LOG_FILE)) {
            const data = fs.readFileSync(LOG_FILE, 'utf8');
            return JSON.parse(data);
        }
    } catch (error) {
        console.error('Lỗi đọc log:', error);
    }
    return [];
}

function writeLogs(logs) {
    try {
        if (MAX_LOGS && logs.length > MAX_LOGS) {
            logs = logs.slice(0, MAX_LOGS);
        }
        fs.writeFileSync(LOG_FILE, JSON.stringify(logs, null, 2));
        if (DEBUG) console.log(`✅ Đã ghi ${logs.length} logs`);
    } catch (error) {
        console.error('Lỗi ghi log:', error);
    }
}

function readAccessKeys() {
    try {
        if (fs.existsSync(ACCESS_FILE)) {
            const data = fs.readFileSync(ACCESS_FILE, 'utf8');
            return JSON.parse(data);
        }
    } catch (error) {
        console.error('Lỗi đọc access keys:', error);
    }
    return [];
}

function writeAccessKeys(keys) {
    try {
        fs.writeFileSync(ACCESS_FILE, JSON.stringify(keys, null, 2));
        if (DEBUG) console.log(`✅ Đã ghi ${keys.length} access keys`);
    } catch (error) {
        console.error('Lỗi ghi access keys:', error);
    }
}

// ================================================================
// HÀM TỰ ĐỘNG XÓA
// ================================================================
function cleanExpiredLogs() {
    const logs = readLogs();
    const now = Date.now();
    
    const validLogs = logs.filter(log => {
        const logTime = new Date(log.timestamp).getTime();
        return (now - logTime) <= EXPIRE_TIME;
    });
    
    const expiredCount = logs.length - validLogs.length;
    if (expiredCount > 0) {
        writeLogs(validLogs);
        if (DEBUG) console.log(`🧹 Đã xóa ${expiredCount} IP hết hạn`);
    }
    
    return validLogs;
}

function cleanExpiredAccessKeys() {
    const keys = readAccessKeys();
    const now = Date.now();
    
    const validKeys = keys.filter(key => {
        const keyTime = new Date(key.timestamp).getTime();
        return (now - keyTime) <= EXPIRE_TIME;
    });
    
    const expiredCount = keys.length - validKeys.length;
    if (expiredCount > 0) {
        writeAccessKeys(validKeys);
        if (DEBUG) console.log(`🧹 Đã xóa ${expiredCount} access key hết hạn`);
    }
    
    return validKeys;
}

// ================================================================
// HÀM TÌM KEY THEO IP
// ================================================================
function findKeyByIP(ip) {
    const logs = readLogs();
    const now = Date.now();
    
    const validLog = logs.find(log => {
        const logTime = new Date(log.timestamp).getTime();
        return log.ip === ip && (now - logTime) <= EXPIRE_TIME;
    });
    
    return validLog || null;
}

// ================================================================
// HÀM TẠO KEY
// ================================================================
function generateKey(prefix = KEY_PREFIX) {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let randomStr = '';
    for (let i = 0; i < 16; i++) {
        randomStr += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return prefix + '-' + randomStr;
}

// ================================================================
// HÀM TẠO ACCESS KEY
// ================================================================
function generateAccessKey() {
    const upper = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    const lower = 'abcdefghijklmnopqrstuvwxyz';
    const digits = '0123456789';
    const specials = '!@#$%^&*()_+-=[]{}|;:,.<>?/~`';
    const allChars = upper + lower + digits + specials;
    
    let randomStr = '';
    for (let i = 0; i < 80; i++) {
        if (i < 15) {
            const source = upper + digits;
            randomStr += source.charAt(Math.floor(Math.random() * source.length));
        } else if (i < 30) {
            const source = lower + digits;
            randomStr += source.charAt(Math.floor(Math.random() * source.length));
        } else if (i < 45) {
            const source = specials + digits;
            randomStr += source.charAt(Math.floor(Math.random() * source.length));
        } else {
            randomStr += allChars.charAt(Math.floor(Math.random() * allChars.length));
        }
    }
    
    const timestamp = Date.now().toString(36);
    const randomSuffix = Math.random().toString(36).substring(2, 10);
    
    return ACCESS_KEY_PREFIX + '-' + randomStr + timestamp + randomSuffix;
}

// ================================================================
// API HEALTH
// ================================================================
app.get('/api/health', (req, res) => {
    cleanExpiredLogs();
    res.json({
        status: 'OK',
        timestamp: new Date().toISOString(),
        service: 'API Key Manager',
        version: '1.0.0',
        environment: NODE_ENV,
        uptime: Math.floor(process.uptime()),
        config: {
            expire_time: `${EXPIRE_TIME/60000} minutes`,
            one_key_per_ip: ONE_KEY_PER_IP,
            key_format: `${KEY_PREFIX}-xxxxxxxxxxxxxxxx`,
            access_key_format: `${ACCESS_KEY_PREFIX}-[80 ký tự hỗn hợp + timestamp]`,
            max_logs: MAX_LOGS || 'unlimited',
            whitelist_ips: WHITELIST_IPS,
            serve_html: SERVE_HTML,
            allowed_domain: ALLOWED_DOMAIN
        }
    });
});

// ================================================================
// API LOGS - CHỈ WHITELIST IP
// ================================================================
app.get('/api/logs', (req, res) => {
    const clientIP = req.headers['x-forwarded-for'] || 
                     req.headers['x-real-ip'] || 
                     req.connection.remoteAddress || 
                     req.socket.remoteAddress || 
                     '0.0.0.0';
    
    const cleanIP = clientIP.replace('::ffff:', '').replace('::1', '127.0.0.1').split(',')[0].trim();
    
    if (!isWhitelisted(cleanIP)) {
        if (DEBUG) console.log(`⛔ IP ${cleanIP} bị từ chối truy cập /api/logs`);
        return res.status(403).json({
            success: false,
            message: 'Forbidden: Access denied. Only whitelisted IPs can access logs.'
        });
    }
    
    if (DEBUG) console.log(`✅ IP ${cleanIP} (whitelist) truy cập /api/logs`);
    
    const logs = cleanExpiredLogs();
    const limit = parseInt(req.query.limit) || 50;
    const now = Date.now();
    
    const sanitizedLogs = logs.slice(0, limit).map(log => {
        const logTime = new Date(log.timestamp).getTime();
        const timeRemaining = EXPIRE_TIME - (now - logTime);
        const expireTimestamp = new Date(logTime + EXPIRE_TIME).toISOString();
        
        const minutesRemaining = Math.floor(timeRemaining / 60000);
        const secondsRemaining = Math.floor((timeRemaining % 60000) / 1000);
        
        return {
            id: log.id,
            ip: log.ip,
            action: log.action,
            key: log.key,
            timestamp: log.timestamp,
            method: log.method || 'GET',
            source: log.source || 'browser',
            access_key_used: log.access_key_used ? log.access_key_used.substring(0, 30) + '...' : null,
            expires_at: expireTimestamp,
            expires_in: `${minutesRemaining} phút ${secondsRemaining} giây`,
            is_expired: timeRemaining <= 0
        };
    });
    
    res.json({
        success: true,
        data: sanitizedLogs,
        total: logs.length,
        limit: limit,
        max_logs: MAX_LOGS || 'unlimited',
        expire_time: `${EXPIRE_TIME/60000} minutes`,
        note: `Key sẽ tự động bị xóa sau ${EXPIRE_TIME/60000} phút kể từ timestamp`
    });
});

// ================================================================
// API KEYS (CHỈ WHITELIST IP)
// ================================================================
app.get('/api/keys', (req, res) => {
    const clientIP = req.headers['x-forwarded-for'] || 
                     req.headers['x-real-ip'] || 
                     req.connection.remoteAddress || 
                     req.socket.remoteAddress || 
                     '0.0.0.0';
    
    const cleanIP = clientIP.replace('::ffff:', '').replace('::1', '127.0.0.1').split(',')[0].trim();
    
    if (!isWhitelisted(cleanIP)) {
        return res.status(403).json({
            success: false,
            message: 'Forbidden: Access denied'
        });
    }
    
    const logs = cleanExpiredLogs();
    const ipKeyMap = {};
    logs.forEach(log => {
        if (!ipKeyMap[log.ip] || new Date(log.timestamp) > new Date(ipKeyMap[log.ip].timestamp)) {
            ipKeyMap[log.ip] = {
                ip: log.ip,
                key: log.key,
                timestamp: log.timestamp,
                action: log.action,
                method: log.method || 'GET',
                source: log.source || 'browser'
            };
        }
    });
    
    const ipKeys = Object.values(ipKeyMap).sort((a, b) => 
        new Date(b.timestamp) - new Date(a.timestamp)
    );
    
    res.json({
        success: true,
        message: 'List of all IPs and their keys',
        total: ipKeys.length,
        max_logs: MAX_LOGS || 'unlimited',
        expire_time: `${EXPIRE_TIME/60000} minutes`,
        data: ipKeys
    });
});

// ================================================================
// API ACCESS
// ================================================================
app.get('/api/access', (req, res) => {
    const clientIP = req.headers['x-forwarded-for'] || 
                     req.headers['x-real-ip'] || 
                     req.connection.remoteAddress || 
                     req.socket.remoteAddress || 
                     '0.0.0.0';
    
    const cleanIP = clientIP.replace('::ffff:', '').replace('::1', '127.0.0.1').split(',')[0].trim();
    
    const accessKey = generateAccessKey();
    const timestamp = new Date().toISOString();
    
    const accessEntry = {
        key: accessKey,
        ip: cleanIP,
        timestamp: timestamp,
        used: false,
        expires_at: new Date(Date.now() + EXPIRE_TIME).toISOString()
    };
    
    const accessKeys = readAccessKeys();
    accessKeys.unshift(accessEntry);
    writeAccessKeys(accessKeys);
    
    if (DEBUG) console.log(`🔑 IP ${cleanIP} tạo access key: ${accessKey.substring(0, 40)}...`);
    
    res.json({
        success: true,
        message: 'Access key created successfully',
        data: {
            access_key: accessKey,
            expires_in: `${EXPIRE_TIME/60000} minutes`,
            expires_at: accessEntry.expires_at,
            note: `Access key có hiệu lực ${EXPIRE_TIME/60000} phút, dùng 1 lần để lấy key chính`,
            format: `${ACCESS_KEY_PREFIX}-[80 ký tự hỗn hợp + timestamp]`
        }
    });
});

// ================================================================
// API REQUEST (GET)
// ================================================================
app.get('/api/request', (req, res) => {
    const accessKey = req.query.access_key || req.headers['x-access-key'];
    
    if (!accessKey) {
        return res.status(401).json({
            success: false,
            message: 'Access key required',
            error: 'Vui lòng cung cấp access_key trong URL hoặc header X-Access-Key',
            how_to_get: 'Truy cập /api/access để lấy access key'
        });
    }
    
    const accessKeys = cleanExpiredAccessKeys();
    const validAccess = accessKeys.find(k => k.key === accessKey && !k.used);
    
    if (!validAccess) {
        return res.status(403).json({
            success: false,
            message: 'Invalid or expired access key',
            error: 'Access key không hợp lệ hoặc đã được sử dụng',
            note: `Mỗi access key chỉ được sử dụng 1 lần và có hiệu lực ${EXPIRE_TIME/60000} phút`
        });
    }
    
    validAccess.used = true;
    validAccess.used_at = new Date().toISOString();
    writeAccessKeys(accessKeys);
    
    const clientIP = req.headers['x-forwarded-for'] || 
                     req.headers['x-real-ip'] || 
                     req.connection.remoteAddress || 
                     req.socket.remoteAddress || 
                     '0.0.0.0';
    
    const cleanIP = clientIP.replace('::ffff:', '').replace('::1', '127.0.0.1').split(',')[0].trim();
    cleanExpiredLogs();
    
    if (ONE_KEY_PER_IP && !isWhitelisted(cleanIP)) {
        const existingLog = findKeyByIP(cleanIP);
        if (existingLog) {
            const timeRemaining = EXPIRE_TIME - (Date.now() - new Date(existingLog.timestamp).getTime());
            const minutesRemaining = Math.floor(timeRemaining / 60000);
            const secondsRemaining = Math.floor((timeRemaining % 60000) / 1000);
            
            if (DEBUG) console.log(`⛔ IP ${cleanIP} đã có key, từ chối tạo mới`);
            
            return res.json({
                success: true,
                message: 'Key already exists for this IP',
                data: {
                    ip: cleanIP,
                    key: existingLog.key,
                    timestamp: existingLog.timestamp,
                    expires_in: `${minutesRemaining} phút ${secondsRemaining} giây`,
                    note: `Key này còn hiệu lực ${minutesRemaining} phút nữa`
                }
            });
        }
    }
    
    const newKey = generateKey();
    const timestamp = new Date().toISOString();
    const email = req.query.email || 'guest@example.com';
    
    const logEntry = {
        id: Date.now(),
        ip: cleanIP,
        email: email,
        action: isWhitelisted(cleanIP) ? 'whitelist_generate' : 'auto_generate',
        key: newKey,
        timestamp: timestamp,
        userAgent: req.headers['user-agent'] || 'Unknown',
        method: 'GET',
        source: 'browser',
        access_key_used: accessKey
    };
    
    const logs = readLogs();
    logs.unshift(logEntry);
    writeLogs(logs);
    
    if (DEBUG) console.log(`✅ Tạo key mới cho IP ${cleanIP}: ${newKey}`);
    
    const responseData = {
        ip: cleanIP,
        key: newKey,
        timestamp: timestamp,
        expire_after: `${EXPIRE_TIME/60000} minutes`,
        note: `Key sẽ tự động xóa sau ${EXPIRE_TIME/60000} phút`,
        access_key_used: accessKey.substring(0, 20) + '...'
    };
    
    if (isWhitelisted(cleanIP)) {
        responseData.whitelisted = true;
        responseData.note = `IP ${cleanIP} trong whitelist, không giới hạn số lượng key`;
    }
    
    res.json({
        success: true,
        message: 'Key generated successfully',
        data: responseData
    });
});

// ================================================================
// API REQUEST (POST)
// ================================================================
app.post('/api/request', (req, res) => {
    const { email, action, custom_ip, access_key } = req.body;
    
    if (!access_key) {
        return res.status(401).json({
            success: false,
            message: 'Access key required',
            error: 'Vui lòng cung cấp access_key trong body'
        });
    }
    
    const accessKeys = cleanExpiredAccessKeys();
    const validAccess = accessKeys.find(k => k.key === access_key && !k.used);
    
    if (!validAccess) {
        return res.status(403).json({
            success: false,
            message: 'Invalid or expired access key'
        });
    }
    
    validAccess.used = true;
    validAccess.used_at = new Date().toISOString();
    writeAccessKeys(accessKeys);
    
    let clientIP = custom_ip || req.headers['x-forwarded-for'] || 
                     req.headers['x-real-ip'] || 
                     req.connection.remoteAddress || 
                     req.socket.remoteAddress || 
                     '0.0.0.0';
    
    const cleanIP = clientIP.replace('::ffff:', '').replace('::1', '127.0.0.1').split(',')[0].trim();
    cleanExpiredLogs();
    
    if (email && (!email.includes('@') || !email.includes('.'))) {
        return res.status(400).json({
            success: false,
            message: 'Invalid email format'
        });
    }
    
    if (ONE_KEY_PER_IP && !isWhitelisted(cleanIP)) {
        const existingLog = findKeyByIP(cleanIP);
        if (existingLog) {
            const timeRemaining = EXPIRE_TIME - (Date.now() - new Date(existingLog.timestamp).getTime());
            const minutesRemaining = Math.floor(timeRemaining / 60000);
            
            if (DEBUG) console.log(`⛔ IP ${cleanIP} đã có key (POST), từ chối tạo mới`);
            
            return res.json({
                success: true,
                message: 'Key already exists for this IP',
                data: {
                    ip: cleanIP,
                    key: existingLog.key,
                    timestamp: existingLog.timestamp,
                    expires_in: `${minutesRemaining} phút`,
                    note: `Key này còn hiệu lực ${minutesRemaining} phút nữa`
                }
            });
        }
    }
    
    const newKey = generateKey();
    const timestamp = new Date().toISOString();
    const userEmail = email || 'api_request@example.com';
    
    const logEntry = {
        id: Date.now(),
        ip: cleanIP,
        email: userEmail,
        action: action || (isWhitelisted(cleanIP) ? 'whitelist_generate' : 'api_generate'),
        key: newKey,
        timestamp: timestamp,
        userAgent: req.headers['user-agent'] || 'API-Client',
        method: 'POST',
        source: 'api',
        access_key_used: access_key
    };
    
    const logs = readLogs();
    logs.unshift(logEntry);
    writeLogs(logs);
    
    if (DEBUG) console.log(`📡 API Request: ${cleanIP} | ${userEmail} | ${newKey}`);
    
    const responseData = {
        ip: cleanIP,
        key: newKey,
        timestamp: timestamp,
        expire_after: `${EXPIRE_TIME/60000} minutes`,
        source: 'api'
    };
    
    if (isWhitelisted(cleanIP)) {
        responseData.whitelisted = true;
        responseData.note = `IP ${cleanIP} trong whitelist, không giới hạn số lượng key`;
    }
    
    res.json({
        success: true,
        message: isWhitelisted(cleanIP) ? 'Key generated via API (whitelist IP)' : 'Key generated via API successfully',
        data: responseData
    });
});

// ================================================================
// API EXTERNAL
// ================================================================
app.post('/api/external', (req, res) => {
    const { api_key, email, action, custom_ip, access_key } = req.body;
    
    if (!api_key || api_key !== API_SECRET) {
        return res.status(401).json({
            success: false,
            message: 'Unauthorized: Invalid API key'
        });
    }
    
    let clientIP = custom_ip || req.headers['x-forwarded-for'] || 
                     req.headers['x-real-ip'] || 
                     req.connection.remoteAddress || 
                     req.socket.remoteAddress || 
                     '0.0.0.0';
    
    const cleanIP = clientIP.replace('::ffff:', '').replace('::1', '127.0.0.1').split(',')[0].trim();
    cleanExpiredLogs();
    
    if (email && (!email.includes('@') || !email.includes('.'))) {
        return res.status(400).json({
            success: false,
            message: 'Invalid email format'
        });
    }
    
    const newKey = generateKey();
    const timestamp = new Date().toISOString();
    const userEmail = email || 'external_request@example.com';
    
    const logEntry = {
        id: Date.now(),
        ip: cleanIP,
        email: userEmail,
        action: action || (isWhitelisted(cleanIP) ? 'whitelist_external' : 'external_generate'),
        key: newKey,
        timestamp: timestamp,
        userAgent: req.headers['user-agent'] || 'External-Client',
        method: 'POST',
        source: 'external',
        external_api_key: true,
        access_key_used: access_key || null
    };
    
    const logs = readLogs();
    logs.unshift(logEntry);
    writeLogs(logs);
    
    if (DEBUG) console.log(`🔗 External Request: ${cleanIP} | ${userEmail} | ${newKey}`);
    
    const responseData = {
        ip: cleanIP,
        key: newKey,
        timestamp: timestamp,
        expire_after: `${EXPIRE_TIME/60000} minutes`,
        source: 'external'
    };
    
    if (isWhitelisted(cleanIP)) {
        responseData.whitelisted = true;
        responseData.note = `IP ${cleanIP} trong whitelist, không giới hạn số lượng key`;
    }
    
    res.json({
        success: true,
        message: isWhitelisted(cleanIP) ? 'Key generated via external API (whitelist)' : 'Key generated via external API',
        data: responseData,
        source: 'external'
    });
});

// ================================================================
// API STATS
// ================================================================
app.get('/api/stats', (req, res) => {
    const logs = cleanExpiredLogs();
    const accessKeys = readAccessKeys();
    const stats = {
        totalRequests: logs.length,
        uniqueIPs: [...new Set(logs.map(l => l.ip))].length,
        actions: logs.reduce((acc, log) => {
            acc[log.action] = (acc[log.action] || 0) + 1;
            return acc;
        }, {}),
        sources: logs.reduce((acc, log) => {
            const source = log.source || 'browser';
            acc[source] = (acc[source] || 0) + 1;
            return acc;
        }, {}),
        accessKeys: {
            total: accessKeys.length,
            used: accessKeys.filter(k => k.used).length,
            unused: accessKeys.filter(k => !k.used).length,
            expired: accessKeys.filter(k => {
                const keyTime = new Date(k.timestamp).getTime();
                return (Date.now() - keyTime) > EXPIRE_TIME;
            }).length
        },
        lastRequest: logs.length > 0 ? logs[0].timestamp : null,
        expire_time: `${EXPIRE_TIME/60000} minutes`,
        one_key_per_ip: ONE_KEY_PER_IP,
        key_format: `${KEY_PREFIX}-xxxxxxxxxxxxxxxx`,
        access_key_format: `${ACCESS_KEY_PREFIX}-[80 ký tự hỗn hợp + timestamp]`,
        max_logs: MAX_LOGS || 'unlimited',
        whitelist_ips: WHITELIST_IPS,
        serve_html: SERVE_HTML,
        allowed_domain: ALLOWED_DOMAIN
    };
    
    res.json({
        success: true,
        data: stats
    });
});

// ================================================================
// DELETE LOGS
// ================================================================
app.delete('/api/logs', (req, res) => {
    const adminKey = req.headers['x-admin-key'];
    
    if (!adminKey || adminKey !== API_SECRET) {
        return res.status(403).json({
            success: false,
            message: 'Forbidden: Invalid admin key'
        });
    }
    
    writeLogs([]);
    res.json({
        success: true,
        message: 'All logs deleted successfully'
    });
});

// ================================================================
// ROUTE MẶC ĐỊNH
// ================================================================
app.use((req, res) => {
    if (req.path.startsWith('/api/')) {
        res.status(404).json({
            success: false,
            message: 'API route not found',
            available_endpoints: {
                root: '/',
                health: '/api/health',
                logs: '/api/logs (WHITELIST ONLY)',
                keys: '/api/keys',
                access: '/api/access',
                request: '/api/request (cần access key)',
                stats: '/api/stats'
            }
        });
    } else if (SERVE_HTML) {
        const indexPath = path.join(__dirname, '../frontend/index.html');
        if (fs.existsSync(indexPath)) {
            res.sendFile(indexPath);
        } else {
            res.status(404).json({
                success: false,
                message: 'Page not found'
            });
        }
    } else {
        res.status(404).json({
            success: false,
            message: 'Page not found'
        });
    }
});

// ================================================================
// ERROR HANDLING
// ================================================================
app.use((err, req, res, next) => {
    console.error('❌ Error:', err.message);
    res.status(500).json({
        success: false,
        message: 'Internal server error',
        ...(NODE_ENV === 'development' && { stack: err.stack })
    });
});

// ================================================================
// START SERVER
// ================================================================
app.listen(PORT, () => {
    console.log(`\n✅ API Server đang chạy trên cổng ${PORT}`);
    console.log(`📝 Environment: ${NODE_ENV}`);
    console.log(`📋 Log file: ${LOG_FILE}`);
    console.log(`📋 Access key file: ${ACCESS_FILE}`);
    console.log(`\n📌 Cấu hình hiện tại:`);
    console.log(`   ⏰ Thời gian hết hạn: ${EXPIRE_TIME/60000} phút`);
    console.log(`   🔑 Giới hạn 1 key/IP: ${ONE_KEY_PER_IP ? 'BẬT' : 'TẮT'}`);
    console.log(`   🌟 Whitelist IP: ${WHITELIST_IPS.join(', ') || 'Không có'}`);
    console.log(`   📊 Giới hạn logs: ${MAX_LOGS || 'Không giới hạn'}`);
    console.log(`   🔑 Prefix key: ${KEY_PREFIX}`);
    console.log(`   🔑 Prefix access key: ${ACCESS_KEY_PREFIX}`);
    console.log(`   🔒 /api/logs: CHỈ WHITELIST IP`);
    console.log(`   🌐 Allowed domain: ${ALLOWED_DOMAIN}`);
    console.log(`   📁 Phục vụ HTML: ${SERVE_HTML ? 'BẬT' : 'TẮT'}`);
    console.log(`\n📡 Endpoints:`);
    console.log(`   🌐 Trang chủ: http://localhost:${PORT}/`);
    console.log(`   🔒 /api/logs (WHITELIST ONLY)`);
    console.log(`   🔑 /api/access`);
    console.log(`   🔑 /api/request`);
    console.log(`   📊 /api/stats`);
    console.log(`   📋 /api/keys\n`);
    
    cleanExpiredLogs();
    cleanExpiredAccessKeys();
});

// Tự động clean mỗi 15 phút
setInterval(() => {
    if (DEBUG) console.log('🔄 Tự động kiểm tra và xóa IP hết hạn...');
    cleanExpiredLogs();
    cleanExpiredAccessKeys();
}, 15 * 60 * 1000);

process.on('SIGTERM', () => {
    console.log('SIGTERM received, shutting down gracefully');
    process.exit(0);
});

process.on('SIGINT', () => {
    console.log('SIGINT received, shutting down gracefully');
    process.exit(0);
});
