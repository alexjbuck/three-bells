const express = require('express');
const { PrismaClient } = require('@prisma/client');
const session = require('express-session');
const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const { PrismaSessionStore } = require('@quixo3/prisma-session-store');
const compression = require('compression');

const prisma = new PrismaClient();
const app = express();

// Middleware
app.use(compression()); // Compress responses
app.use(express.urlencoded({ extended: true }));
app.use(session({
    cookie: { 
        maxAge: 7 * 24 * 60 * 60 * 1000,
        secure: process.env.NODE_ENV === 'production', // HTTPS only in production
        sameSite: 'lax',
        httpOnly: true
    },
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    store: new PrismaSessionStore(prisma, { checkPeriod: 2 * 60 * 1000, dbRecordIdIsSessionId: true })
}));

app.use(passport.initialize());
app.use(passport.session());

const isProd = process.env.NODE_ENV === 'production';
const baseUrl = isProd ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : 'http://localhost:3000';

passport.use(new GoogleStrategy({
    clientID: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackURL: `${baseUrl}/api/auth/callback`
}, (token, tokenSecret, profile, done) => done(null, profile)));

passport.serializeUser((user, done) => done(null, user));
passport.deserializeUser((obj, done) => done(null, obj));

const cleanNum = (n) => Math.round(n * 100) / 100;

// MAIN ROUTE
app.get('/', async (req, res) => {
    // redirect to /api
    res.redirect('/api');
});
const packageJson = require('../package.json');

app.get('/api', async (req, res) => {
    try {
        // Check authentication
        if (!req.isAuthenticated || !req.isAuthenticated()) {
        // Landing page - no JavaScript, pure HTML/CSS
        // Don't cache - this is the same route as authenticated page
        const html = `
            <!DOCTYPE html>
            <html lang="en">
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>Three Bells - Navy Reserve RMP Tracker</title>
                <style>
                    * { margin: 0; padding: 0; box-sizing: border-box; }
                    body {
                        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
                        background: linear-gradient(135deg, #002447 0%, #003d6b 50%, #002447 100%);
                        min-height: 100vh;
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        padding: 20px;
                    }
                    .container {
                        background: white;
                        border-radius: 20px;
                        box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
                        padding: 60px 40px;
                        max-width: 500px;
                        width: 100%;
                        text-align: center;
                        animation: fadeIn 0.6s ease-out;
                    }
                    @keyframes fadeIn {
                        from { opacity: 0; transform: translateY(20px); }
                        to { opacity: 1; transform: translateY(0); }
                    }
                    .icon {
                        width: 90px;
                        height: 90px;
                        background: linear-gradient(135deg, #002447 0%, #003d6b 100%);
                        border-radius: 20px;
                        margin: 0 auto 30px;
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        box-shadow: 0 10px 30px rgba(0, 36, 71, 0.3);
                        position: relative;
                        padding: 12px;
                    }
                    .bells {
                        display: grid;
                        grid-template-columns: 1fr 1fr;
                        grid-template-rows: 1fr 1fr;
                        gap: 4px;
                        align-items: center;
                        justify-content: center;
                        width: 100%;
                        height: 100%;
                        position: relative;
                    }
                    .bell {
                        font-size: 20px;
                        line-height: 1;
                        filter: drop-shadow(0 2px 3px rgba(0,0,0,0.3));
                        display: flex;
                        align-items: center;
                        justify-content: center;
                    }
                    .bell:nth-child(1) {
                        grid-column: 1 / -1;
                        grid-row: 1;
                        justify-self: center;
                        align-self: end;
                    }
                    .bell:nth-child(2) {
                        grid-column: 1;
                        grid-row: 2;
                        justify-self: center;
                        align-self: start;
                    }
                    .bell:nth-child(3) {
                        grid-column: 2;
                        grid-row: 2;
                        justify-self: center;
                        align-self: start;
                    }
                    h1 {
                        font-size: 2.5em;
                        color: #002447;
                        margin-bottom: 10px;
                        font-weight: 700;
                        letter-spacing: -0.5px;
                    }
                    .subtitle {
                        color: #666;
                        font-size: 1.1em;
                        margin-bottom: 40px;
                        line-height: 1.6;
                    }
                    .login-button {
                        display: inline-flex;
                        align-items: center;
                        justify-content: center;
                        gap: 12px;
                        background: #4285F4;
                        color: white;
                        padding: 14px 28px;
                        text-decoration: none;
                        border-radius: 10px;
                        font-size: 1em;
                        font-weight: 600;
                        transition: all 0.3s ease;
                        box-shadow: 0 4px 15px rgba(66, 133, 244, 0.4);
                        border: none;
                        cursor: pointer;
                    }
                    .login-button:hover {
                        background: #357ae8;
                        transform: translateY(-2px);
                        box-shadow: 0 6px 20px rgba(66, 133, 244, 0.5);
                    }
                    .login-button:active {
                        transform: translateY(0);
                    }
                    .google-icon {
                        width: 20px;
                        height: 20px;
                        background: white;
                        border-radius: 4px;
                        display: inline-block;
                    }
                    .features {
                        margin-top: 40px;
                        padding-top: 40px;
                        border-top: 1px solid #eee;
                        text-align: left;
                    }
                    .features h3 {
                        color: #002447;
                        font-size: 1.1em;
                        margin-bottom: 20px;
                        text-align: center;
                    }
                    .feature {
                        display: flex;
                        align-items: center;
                        gap: 12px;
                        margin-bottom: 15px;
                        color: #555;
                        font-size: 0.95em;
                    }
                    .feature-icon {
                        width: 24px;
                        height: 24px;
                        background: #f0f7ff;
                        border-radius: 6px;
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        color: #002447;
                        font-weight: bold;
                        flex-shrink: 0;
                    }
                </style>
            </head>
            <body>
                <div class="container">
                    <div class="icon">
                        <div class="bells">
                            <span class="bell">🔔</span>
                            <span class="bell">🔔</span>
                            <span class="bell">🔔</span>
                        </div>
                    </div>
                    <h1>Three Bells</h1>
                    <p class="subtitle">Navy Reserve RMP Tracker</p>
                    <a href="/api/auth/google" class="login-button">
                        <svg class="google-icon" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                            <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                            <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                            <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                            <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                        </svg>
                        Sign in with Google
                    </a>
                    <div class="features">
                        <h3>Track & Manage</h3>
                        <div class="feature">
                            <div class="feature-icon">⏱</div>
                            <span>Log your training hours</span>
                        </div>
                        <div class="feature">
                            <div class="feature-icon">📋</div>
                            <span>Bundle hours into RMPs</span>
                        </div>
                        <div class="feature">
                            <div class="feature-icon">💰</div>
                            <span>Track payment status</span>
                        </div>
                    </div>
                </div>
            </body>
            </html>
        `;
        return res.send(html);
    }

    const userId = req.user.id;
    const todayStr = new Date().toISOString().split('T')[0];
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setUTCDate(thirtyDaysAgo.getUTCDate() - 30);
    thirtyDaysAgo.setUTCHours(0, 0, 0, 0);

    // Optimize: Fetch data in parallel and calculate metrics in database
    const [logs, rmps, unbundledHours, rmpCounts] = await Promise.all([
        prisma.log.findMany({ where: { userId }, orderBy: { start: 'desc' } }),
        prisma.rmp.findMany({ where: { userId }, orderBy: { filedDate: 'desc' } }),
        // Calculate unbundled hours in database
        prisma.log.aggregate({
            where: { userId, rmpId: null },
            _sum: { hours: true }
        }),
        // Count RMPs by status in database
        prisma.rmp.groupBy({
            by: ['status'],
            where: { userId },
            _count: true
        })
    ]);

    const earnedHours = cleanNum(unbundledHours._sum.hours || 0);
    const availableRMPs = Math.floor(earnedHours / 3);

    // Calculate RMP summary metrics from database results
    const pendingRmps = rmpCounts.find(r => r.status === 'submitted')?._count || 0;
    const paidRmps = rmpCounts.find(r => r.status === 'paid')?._count || 0;
    
    // Count pending RMPs in last 30 days
    const pendingRmpsLast30Days = rmps.filter(r => {
        if (r.status !== 'submitted') return false;
        const filedDate = new Date(r.filedDate);
        filedDate.setUTCHours(0, 0, 0, 0);
        return filedDate >= thirtyDaysAgo;
    }).length;

    let editLog = req.query.edit ? await prisma.log.findFirst({ where: { id: req.query.edit, userId, rmpId: null } }) : null;

    const html = `
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Three Bells - Dashboard</title>
            <style>
                * { margin: 0; padding: 0; box-sizing: border-box; }
                body {
                    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
                    background: linear-gradient(135deg, #002447 0%, #003d6b 50%, #002447 100%);
                    min-height: 100vh;
                    padding: 20px;
                }
                .container {
                    background: white;
                    border-radius: 20px;
                    box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
                    max-width: 700px;
                    margin: 0 auto;
                    padding: 30px;
                    animation: fadeIn 0.6s ease-out;
                }
                @keyframes fadeIn {
                    from { opacity: 0; transform: translateY(20px); }
                    to { opacity: 1; transform: translateY(0); }
                }
                .header {
                    display: flex;
                    justify-content: space-between;
                    align-items: flex-start;
                    margin-bottom: 30px;
                    padding-bottom: 20px;
                    border-bottom: 2px solid #f0f0f0;
                }
                .header h1 {
                    font-size: 2em;
                    color: #002447;
                    margin: 0;
                    font-weight: 700;
                    letter-spacing: -0.5px;
                }
                .version {
                    color: #999;
                    font-size: 0.75em;
                    margin-top: 4px;
                }
                .profile-container {
                    position: relative;
                }
                .profile-btn {
                    background: none;
                    border: none;
                    cursor: pointer;
                    padding: 5px;
                    border-radius: 50%;
                    display: flex;
                    align-items: center;
                    transition: transform 0.2s;
                }
                .profile-btn:hover {
                    transform: scale(1.05);
                }
                .profile-img {
                    width: 40px;
                    height: 40px;
                    border-radius: 50%;
                    border: 2px solid #ddd;
                }
                .profile-avatar {
                    width: 40px;
                    height: 40px;
                    border-radius: 50%;
                    border: 2px solid #ddd;
                    background: #666;
                    color: white;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    font-weight: bold;
                    font-size: 16px;
                }
                .profile-dropdown {
                    display: none;
                    position: absolute;
                    right: 0;
                    top: 50px;
                    background: white;
                    border: 1px solid #ddd;
                    border-radius: 12px;
                    box-shadow: 0 8px 24px rgba(0,0,0,0.15);
                    min-width: 220px;
                    z-index: 1000;
                    overflow: hidden;
                }
                .profile-dropdown.show {
                    display: block;
                }
                .profile-info {
                    padding: 16px;
                    border-bottom: 1px solid #eee;
                }
                .profile-name {
                    font-weight: 600;
                    font-size: 0.95em;
                    color: #002447;
                }
                .profile-email {
                    color: #666;
                    font-size: 0.85em;
                    margin-top: 4px;
                }
                .profile-logout {
                    display: block;
                    padding: 12px 16px;
                    color: #666;
                    text-decoration: none;
                    font-size: 0.9em;
                    transition: background 0.2s;
                }
                .profile-logout:hover {
                    background: #f5f5f5;
                }
                .summary-card {
                    background: linear-gradient(135deg, #002447 0%, #003d6b 100%);
                    color: white;
                    padding: 30px;
                    border-radius: 16px;
                    margin-bottom: 30px;
                    box-shadow: 0 10px 30px rgba(0, 36, 71, 0.3);
                }
                .summary-grid {
                    display: grid;
                    grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
                    gap: 24px;
                }
                .summary-item {
                    text-align: center;
                }
                .summary-label {
                    opacity: 0.9;
                    font-size: 0.85em;
                    text-transform: uppercase;
                    letter-spacing: 0.5px;
                    margin-bottom: 8px;
                }
                .summary-value {
                    font-size: 2.2em;
                    font-weight: 700;
                    margin: 8px 0;
                }
                .summary-sub {
                    color: #ffc107;
                    font-weight: 600;
                    font-size: 0.9em;
                }
                .card {
                    background: white;
                    padding: 24px;
                    border-radius: 16px;
                    margin-bottom: 24px;
                    border: 1px solid #eee;
                    box-shadow: 0 2px 8px rgba(0,0,0,0.05);
                    transition: box-shadow 0.2s;
                }
                .card:hover {
                    box-shadow: 0 4px 12px rgba(0,0,0,0.1);
                }
                .card.highlight {
                    border: 2px solid #ffc107;
                    background: #fffef5;
                }
                .card.edit-mode {
                    background: #fff3cd;
                    border-color: #ffc107;
                }
                .card h3 {
                    margin: 0 0 20px 0;
                    color: #002447;
                    font-size: 1.3em;
                    font-weight: 600;
                }
                .form-group {
                    margin-bottom: 16px;
                }
                .form-label {
                    display: block;
                    font-size: 0.85em;
                    font-weight: 600;
                    color: #555;
                    margin-bottom: 8px;
                    text-transform: uppercase;
                    letter-spacing: 0.5px;
                }
                input[type="date"],
                input[type="time"],
                input[type="number"] {
                    width: 100%;
                    padding: 12px;
                    border: 2px solid #e0e0e0;
                    border-radius: 8px;
                    font-size: 1em;
                    transition: border-color 0.2s;
                    font-family: inherit;
                }
                input:focus {
                    outline: none;
                    border-color: #002447;
                }
                .time-grid {
                    display: grid;
                    grid-template-columns: 1fr 1fr;
                    gap: 12px;
                }
                @media (max-width: 440px) {
                    .time-grid {
                        grid-template-columns: 1fr;
                    }
                }
                .divider {
                    text-align: center;
                    margin: 16px 0;
                    font-size: 0.8em;
                    color: #999;
                    position: relative;
                }
                .divider::before,
                .divider::after {
                    content: '';
                    position: absolute;
                    top: 50%;
                    width: 40%;
                    height: 1px;
                    background: #eee;
                }
                .divider::before {
                    left: 0;
                }
                .divider::after {
                    right: 0;
                }
                .manual-input {
                    display: flex;
                    gap: 12px;
                }
                .btn {
                    padding: 12px 24px;
                    border: none;
                    border-radius: 8px;
                    font-weight: 600;
                    font-size: 1em;
                    cursor: pointer;
                    transition: all 0.2s;
                    font-family: inherit;
                }
                .btn-primary {
                    background: #002447;
                    color: white;
                }
                .btn-primary:hover {
                    background: #003d6b;
                    transform: translateY(-1px);
                    box-shadow: 0 4px 12px rgba(0, 36, 71, 0.3);
                }
                .btn-warning {
                    background: #ffc107;
                    color: #002447;
                }
                .btn-warning:hover {
                    background: #ffb300;
                    transform: translateY(-1px);
                    box-shadow: 0 4px 12px rgba(255, 193, 7, 0.3);
                }
                .btn-small {
                    padding: 6px 12px;
                    font-size: 0.85em;
                }
                .btn-danger {
                    background: #dc3545;
                    color: white;
                }
                .btn-danger:hover {
                    background: #c82333;
                }
                .btn-link {
                    background: none;
                    color: #002447;
                    text-decoration: underline;
                    padding: 0;
                    font-size: 0.9em;
                }
                .section-title {
                    font-size: 1.4em;
                    font-weight: 600;
                    color: #002447;
                    margin: 40px 0 20px 0;
                }
                .rmp-card {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    padding: 20px;
                    border-left: 5px solid;
                    border-radius: 12px;
                    margin-bottom: 16px;
                    background: #f8f9fa;
                }
                .rmp-card.paid {
                    border-left-color: #28a745;
                }
                .rmp-card.pending {
                    border-left-color: #ffc107;
                }
                .rmp-info strong {
                    display: block;
                    color: #002447;
                    margin-bottom: 8px;
                }
                .rmp-badge {
                    display: inline-block;
                    font-size: 0.75em;
                    padding: 4px 10px;
                    border-radius: 12px;
                    color: white;
                    text-transform: uppercase;
                    font-weight: 600;
                    letter-spacing: 0.5px;
                }
                .rmp-badge.paid {
                    background: #28a745;
                }
                .rmp-badge.pending {
                    background: #ffc107;
                }
                .rmp-actions {
                    display: flex;
                    gap: 8px;
                }
                .history-table {
                    width: 100%;
                    border-collapse: collapse;
                    background: white;
                    border-radius: 12px;
                    overflow: hidden;
                    box-shadow: 0 2px 8px rgba(0,0,0,0.05);
                }
                .history-table tr {
                    border-bottom: 1px solid #f0f0f0;
                    transition: background 0.2s;
                }
                .history-table tr:hover {
                    background: #f8f9fa;
                }
                .history-table tr.locked {
                    opacity: 0.5;
                }
                .history-table tr.editing {
                    background: #fff3cd !important;
                    border-left: 4px solid #ffc107;
                }
                .history-table tr.editing:hover {
                    background: #fff3cd !important;
                }
                .history-table td {
                    padding: 16px;
                    vertical-align: middle;
                }
                .history-date {
                    font-weight: 500;
                    color: #002447;
                }
                .history-time {
                    color: #666;
                    font-size: 0.85em;
                    margin-top: 4px;
                }
                .history-hours {
                    font-weight: 600;
                    font-size: 1.1em;
                    color: #002447;
                }
                .history-actions {
                    text-align: right;
                }
                .history-actions a {
                    text-decoration: none;
                    margin-right: 8px;
                    font-size: 1.2em;
                }
                .history-actions button {
                    background: none;
                    border: none;
                    color: #dc3545;
                    cursor: pointer;
                    font-size: 1.2em;
                    padding: 0;
                    margin-left: 8px;
                }
                .loading-overlay {
                    display: none;
                    position: fixed;
                    top: 0;
                    left: 0;
                    width: 100%;
                    height: 100%;
                    background: rgba(255,255,255,0.9);
                    z-index: 9999;
                    justify-content: center;
                    align-items: center;
                    flex-direction: column;
                }
                .spinner {
                    width: 50px;
                    height: 50px;
                    border: 4px solid #f3f3f3;
                    border-top: 4px solid #002447;
                    border-radius: 50%;
                    animation: spin 1s linear infinite;
                }
                @keyframes spin {
                    0% { transform: rotate(0deg); }
                    100% { transform: rotate(360deg); }
                }
            </style>
        </head>
        <body>
            <div id="loader" class="loading-overlay">
                <div class="spinner"></div>
            </div>

            <div class="container">
                <div class="header">
                    <div>
                        <h1>Three Bells</h1>
                        <div class="version">v${packageJson.version}</div>
                    </div>
                    <div class="profile-container">
                        <button id="profileBtn" class="profile-btn">
                            ${req.user.photos && req.user.photos[0] ? 
                                `<img src="${req.user.photos[0].value}" alt="Profile" class="profile-img">` :
                                `<div class="profile-avatar">${(req.user.displayName || req.user.emails?.[0]?.value || 'U')[0].toUpperCase()}</div>`
                            }
                        </button>
                        <div id="profileDropdown" class="profile-dropdown">
                            <div class="profile-info">
                                <div class="profile-name">${req.user.displayName || 'User'}</div>
                                <div class="profile-email">${req.user.emails && req.user.emails[0] ? req.user.emails[0].value : ''}</div>
                            </div>
                            <a href="/api/logout" class="profile-logout">Logout</a>
                        </div>
                    </div>
                </div>

                <div class="summary-card">
                    <div class="summary-grid">
                        <div class="summary-item">
                            <div class="summary-label">Unbundled Balance</div>
                            <div class="summary-value">${earnedHours} hrs</div>
                            <div class="summary-sub">${availableRMPs} RMPs Ready</div>
                        </div>
                        <div class="summary-item">
                            <div class="summary-label">Pending RMPs</div>
                            <div class="summary-value">${pendingRmps}</div>
                            <div class="summary-sub">${pendingRmpsLast30Days} in last 30 days</div>
                        </div>
                        <div class="summary-item">
                            <div class="summary-label">Paid RMPs</div>
                            <div class="summary-value">${paidRmps}</div>
                        </div>
                    </div>
                </div>

                ${availableRMPs > 0 && !editLog ? `
                    <div class="card highlight">
                        <h3>Ready to File RMP</h3>
                        <form action="/api/submit-unit" method="POST">
                            <div class="form-group">
                                <label class="form-label">EDM Filing Date</label>
                                <input type="date" name="filedDate" value="${todayStr}" required>
                            </div>
                            <button type="submit" class="btn btn-warning" style="width:100%;">Bundle 3.0 hrs</button>
                        </form>
                    </div>
                ` : ''}

                <div class="card ${editLog ? 'edit-mode' : ''}">
                    <h3>${editLog ? 'Edit Entry' : 'Log Hours'}</h3>
                    <form action="${editLog ? `/api/update/${editLog.id}` : '/api/add'}" method="POST">
                        <div class="form-group">
                            <label class="form-label">Work Date</label>
                            <input type="date" name="workDate" value="${editLog ? editLog.start.toISOString().split('T')[0] : todayStr}" required>
                        </div>
                        <div class="form-group">
                            <label class="form-label">Time Range</label>
                            <div class="time-grid">
                                <input type="time" name="startTime" value="${editLog && editLog.start.getTime() !== editLog.end.getTime() ? editLog.start.toISOString().slice(11,16) : ''}" placeholder="Start">
                                <input type="time" name="endTime" value="${editLog && editLog.start.getTime() !== editLog.end.getTime() ? editLog.end.toISOString().slice(11,16) : ''}" placeholder="End">
                            </div>
                        </div>
                        <div class="divider">OR MANUAL</div>
                        <div class="form-group">
                            <div class="manual-input">
                                <input type="number" step="0.1" name="manualHours" value="${editLog && editLog.start.getTime() === editLog.end.getTime() ? editLog.hours : ''}" placeholder="Hours" style="flex:1;">
                                <button type="submit" class="btn btn-primary">${editLog ? 'Save' : 'Log'}</button>
                            </div>
                        </div>
                        ${editLog ? `<a href="/api" class="btn btn-link" style="display:block; text-align:center; margin-top:12px;">Cancel</a>` : ''}
                    </form>
                </div>

                <h2 class="section-title">Submitted RMPs</h2>
                ${rmps.length > 0 ? rmps.map(r => {
                    const date = new Date(r.filedDate);
                    const month = date.getUTCMonth() + 1;
                    const day = date.getUTCDate();
                    const year = date.getUTCFullYear();
                    const displayDate = `${month}/${day}/${year}`;
                    return `
                    <div class="rmp-card ${r.status === 'paid' ? 'paid' : 'pending'}">
                        <div class="rmp-info">
                            <strong>Filed: ${displayDate}</strong>
                            <span class="rmp-badge ${r.status === 'paid' ? 'paid' : 'pending'}">${r.status}</span>
                        </div>
                        <div class="rmp-actions">
                            <form action="/api/rmp/toggle-paid/${r.id}" method="POST" style="display:inline;">
                                <button type="submit" class="btn btn-small ${r.status === 'paid' ? 'btn-primary' : 'btn-warning'}">${r.status === 'paid' ? 'Unpay' : 'Mark Paid'}</button>
                            </form>
                            <form action="/api/rmp/delete/${r.id}" method="POST" onsubmit="return confirm('Unsubmit this RMP?')" style="display:inline;">
                                <button type="submit" class="btn btn-small btn-danger">&times;</button>
                            </form>
                        </div>
                    </div>
                `;
                }).join('') : '<p style="color:#999; text-align:center; padding:20px;">No submitted RMPs yet</p>'}

                <h2 class="section-title">History</h2>
                <table class="history-table">
                    ${logs.length > 0 ? logs.map(l => `
                        <tr class="${l.rmpId ? 'locked' : ''} ${editLog && editLog.id === l.id ? 'editing' : ''}">
                            <td>
                                <div class="history-date">${l.start.toLocaleDateString()}</div>
                                <div class="history-time">${l.start.getTime() !== l.end.getTime() ? l.start.toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'}) + ' - ' + l.end.toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'}) : 'Manual entry'}</div>
                            </td>
                            <td class="history-hours">${l.hours}h</td>
                            <td class="history-actions">
                                ${!l.rmpId ? `
                                    <a href="/api?edit=${l.id}">✏️</a>
                                    <form action="/api/delete/${l.id}" method="POST" style="display:inline;" onsubmit="return confirm('Delete this entry?')">
                                        <button type="submit">&times;</button>
                                    </form>
                                ` : '<span style="color:#999;">🔒 Bundled</span>'}
                            </td>
                        </tr>
                    `).join('') : '<tr><td colspan="3" style="text-align:center; padding:40px; color:#999;">No entries yet</td></tr>'}
                </table>
            </div>
            <script>
                document.querySelectorAll('form').forEach(f => f.addEventListener('submit', () => { 
                    document.getElementById('loader').style.display = 'flex'; 
                }));
                
                // Profile dropdown toggle
                const profileBtn = document.getElementById('profileBtn');
                const profileDropdown = document.getElementById('profileDropdown');
                if (profileBtn && profileDropdown) {
                    profileBtn.addEventListener('click', (e) => {
                        e.stopPropagation();
                        profileDropdown.classList.toggle('show');
                    });
                    document.addEventListener('click', () => {
                        profileDropdown.classList.remove('show');
                    });
                    profileDropdown.addEventListener('click', (e) => e.stopPropagation());
                }
            </script>
        </body>
        </html>
    `;
    res.send(html);
    } catch (error) {
        console.error('Error in /api route:', error);
        res.status(500).send('Internal Server Error');
    }
});

// LOGIC HELPERS
const getTimes = (body) => {
    const { workDate, startTime, endTime, manualHours } = body;
    if (manualHours) {
        const d = new Date(`${workDate}T12:00:00`);
        return { hours: parseFloat(manualHours), start: d, end: d };
    }
    const start = new Date(`${workDate}T${startTime}:00`);
    let end = new Date(`${workDate}T${endTime}:00`);
    if (end < start) end.setDate(end.getDate() + 1);
    return { hours: cleanNum((end - start) / 3600000), start, end };
};

// HANDLERS
app.post('/api/add', async (req, res) => {
    const data = getTimes(req.body);
    await prisma.log.create({ data: { ...data, userId: req.user.id } });
    res.redirect('/api');
});

app.post('/api/update/:id', async (req, res) => {
    const data = getTimes(req.body);
    await prisma.log.updateMany({ where: { id: req.params.id, userId: req.user.id, rmpId: null }, data });
    res.redirect('/api');
});

app.post('/api/submit-unit', async (req, res) => {
    const earned = await prisma.log.findMany({ where: { userId: req.user.id, rmpId: null }, orderBy: { start: 'asc' } });
    if (earned.reduce((s, l) => s + l.hours, 0) >= 3) {
        await prisma.$transaction(async (tx) => {
            // Parse date string (YYYY-MM-DD) and create at UTC midnight for timezone independence
            const [year, month, day] = req.body.filedDate.split('-').map(Number);
            const filedDate = new Date(Date.UTC(year, month - 1, day));
            const rmp = await tx.rmp.create({ data: { userId: req.user.id, filedDate } });
            let needed = 3.0;
            for (const log of earned) {
                if (needed <= 0) break;
                if (log.hours <= needed) {
                    needed = cleanNum(needed - log.hours);
                    await tx.log.update({ where: { id: log.id }, data: { rmpId: rmp.id } });
                } else {
                    const remainder = cleanNum(log.hours - needed);
                    await tx.log.update({ where: { id: log.id }, data: { hours: needed, rmpId: rmp.id } });
                    await tx.log.create({ data: { userId: req.user.id, hours: remainder, start: log.start, end: log.end } });
                    needed = 0;
                }
            }
        });
    }
    res.redirect('/api');
});

app.post('/api/rmp/toggle-paid/:id', async (req, res) => {
    const rmp = await prisma.rmp.findUnique({ where: { id: req.params.id } });
    await prisma.rmp.update({ where: { id: rmp.id }, data: { status: rmp.status === 'paid' ? 'submitted' : 'paid' } });
    res.redirect('/api');
});

app.post('/api/rmp/delete/:id', async (req, res) => {
    await prisma.$transaction(async (tx) => {
        await tx.rmp.delete({ where: { id: req.params.id } });
        // Consolidation: Merge logs with identical start/end/user that are now unbundled
        const logs = await tx.log.findMany({ where: { userId: req.user.id, rmpId: null }, orderBy: { start: 'asc' } });
        for (let i = 0; i < logs.length - 1; i++) {
            const a = logs[i]; const b = logs[i+1];
            if (a.start.getTime() === b.start.getTime() && a.end.getTime() === b.end.getTime()) {
                await tx.log.update({ where: { id: a.id }, data: { hours: cleanNum(a.hours + b.hours) } });
                await tx.log.delete({ where: { id: b.id } });
                logs.splice(i+1, 1); i--;
            }
        }
    });
    res.redirect('/api');
});

app.post('/api/delete/:id', async (req, res) => {
    await prisma.log.deleteMany({ where: { id: req.params.id, userId: req.user.id, rmpId: null } });
    res.redirect('/api');
});

app.get('/api/auth/google', passport.authenticate('google', { scope: ['profile', 'email'] }));
app.get('/api/auth/callback', passport.authenticate('google', { successRedirect: '/api', failureRedirect: '/api' }));
app.get('/api/logout', (req, res) => req.logout(() => res.redirect('/api')));

module.exports = app;