const express = require('express');
const { PrismaClient } = require('@prisma/client');
const session = require('express-session');
const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const { PrismaSessionStore } = require('@quixo3/prisma-session-store');

const prisma = new PrismaClient();
const app = express();

// Middleware
app.use(express.urlencoded({ extended: true }));
app.use(session({
    cookie: { maxAge: 7 * 24 * 60 * 60 * 1000 },
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
    if (!req.isAuthenticated()) {
        return res.send(`
            <div style="font-family:sans-serif; text-align:center; padding-top:100px;">
                <h1>Three Bells</h1>
                <p>Navy Reserve RMP Tracker</p>
                <a href="/api/auth/google" style="background:#4285F4; color:white; padding:12px 24px; text-decoration:none; border-radius:5px; display:inline-block;">Login with Google</a>
            </div>
        `);
    }

    const userId = req.user.id;
    const logs = await prisma.log.findMany({ where: { userId }, orderBy: { start: 'desc' } });
    const rmps = await prisma.rmp.findMany({ where: { userId }, orderBy: { filedDate: 'desc' } });

    const earnedHours = cleanNum(logs.filter(l => !l.rmpId).reduce((s, l) => s + l.hours, 0));
    const availableRMPs = Math.floor(earnedHours / 3);
    const todayStr = new Date().toISOString().split('T')[0];

    // Calculate RMP summary metrics
    const pendingRmps = rmps.filter(r => r.status === 'submitted').length;
    const paidRmps = rmps.filter(r => r.status === 'paid').length;
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setUTCDate(thirtyDaysAgo.getUTCDate() - 30);
    thirtyDaysAgo.setUTCHours(0, 0, 0, 0); // Start of day 30 days ago
    // Count pending RMPs from (today - 30 days) onwards, including future dates
    const pendingRmpsLast30Days = rmps.filter(r => {
        if (r.status !== 'submitted') return false;
        const filedDate = new Date(r.filedDate);
        filedDate.setUTCHours(0, 0, 0, 0); // Normalize to start of day for comparison
        return filedDate >= thirtyDaysAgo; // Includes future dates
    }).length;

    let editLog = req.query.edit ? await prisma.log.findFirst({ where: { id: req.query.edit, userId, rmpId: null } }) : null;

    res.send(`
        <style>
            .loading-overlay { display: none; position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(255,255,255,0.8); z-index: 9999; justify-content: center; align-items: center; flex-direction: column; }
            .spinner { width: 40px; height: 40px; border: 4px solid #f3f3f3; border-top: 4px solid #002447; border-radius: 50%; animation: spin 1s linear infinite; }
            @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
            .card { background: #f8f9fa; padding: 15px; border-radius: 10px; margin-bottom: 20px; border: 1px solid #eee; }
            .rmp-badge { font-size: 0.7em; padding: 3px 8px; border-radius: 10px; color: white; text-transform: uppercase; }
        </style>

        <div id="loader" class="loading-overlay"><div class="spinner"></div></div>

        <div style="font-family:sans-serif; max-width:600px; margin:auto; padding:20px;">
            <div style="display:flex; justify-content:space-between; align-items:center;">
                <div>
                    <h1 style="margin:0;">Three Bells</h1>
                    <small style="color:#999; font-size:0.7em;">v${packageJson.version}</small>
                </div>
                <div style="position:relative;">
                    <button id="profileBtn" style="background:none; border:none; cursor:pointer; padding:5px; border-radius:50%; display:flex; align-items:center; gap:8px;">
                        ${req.user.photos && req.user.photos[0] ? 
                            `<img src="${req.user.photos[0].value}" alt="Profile" style="width:32px; height:32px; border-radius:50%; border:2px solid #ddd;">` :
                            `<div style="width:32px; height:32px; border-radius:50%; border:2px solid #ddd; background:#666; color:white; display:flex; align-items:center; justify-content:center; font-weight:bold; font-size:14px;">${(req.user.displayName || req.user.emails?.[0]?.value || 'U')[0].toUpperCase()}</div>`
                        }
                    </button>
                    <div id="profileDropdown" style="display:none; position:absolute; right:0; top:40px; background:white; border:1px solid #ddd; border-radius:8px; box-shadow:0 4px 12px rgba(0,0,0,0.15); min-width:200px; z-index:1000; padding:12px;">
                        <div style="padding:8px 12px; border-bottom:1px solid #eee;">
                            <div style="font-weight:bold; font-size:0.9em;">${req.user.displayName || 'User'}</div>
                            <div style="color:#666; font-size:0.8em; margin-top:4px;">${req.user.emails && req.user.emails[0] ? req.user.emails[0].value : ''}</div>
                        </div>
                        <a href="/api/logout" style="display:block; padding:8px 12px; color:#666; text-decoration:none; font-size:0.9em; border-radius:4px; transition:background 0.2s;" onmouseover="this.style.background='#f5f5f5'" onmouseout="this.style.background='white'">Logout</a>
                    </div>
                </div>
            </div>

            <div style="background:#002447; color:white; padding:20px; border-radius:12px; margin: 20px 0;">
                <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(140px, 1fr)); gap:20px;">
                    <div>
                        <small style="opacity:0.8;">UNBUNDLED BALANCE</small>
                        <h2 style="margin:5px 0; font-size:2em;">${earnedHours} hrs</h2>
                        <div style="color:#ffc107; font-weight:bold; font-size:0.9em;">${availableRMPs} RMPs Ready</div>
                    </div>
                    <div>
                        <small style="opacity:0.8;">PENDING RMPs</small>
                        <h2 style="margin:5px 0; font-size:2em;">${pendingRmps}</h2>
                        <div style="color:#ffc107; font-weight:bold; font-size:0.9em;">${pendingRmpsLast30Days} in last 30 days</div>
                    </div>
                    <div>
                        <small style="opacity:0.8;">PAID RMPs</small>
                        <h2 style="margin:5px 0; font-size:2em;">${paidRmps}</h2>
                    </div>
                </div>
            </div>

            ${availableRMPs > 0 && !editLog ? `
                <div class="card" style="border: 2px solid #ffc107;">
                    <form action="/api/submit-unit" method="POST">
                        <label style="font-size:0.8em; font-weight:bold;">EDM FILING DATE</label>
                        <input type="date" name="filedDate" value="${todayStr}" required style="width:100%; padding:10px; margin: 8px 0;">
                        <button type="submit" style="width:100%; background:#ffc107; padding:12px; border:none; border-radius:5px; font-weight:bold; cursor:pointer;">Bundle 3.0 hrs</button>
                    </form>
                </div>
            ` : ''}

            <div class="card" style="background:${editLog ? '#fff3cd' : '#f8f9fa'}">
                <h3 style="margin-top:0;">${editLog ? 'Edit Entry' : 'Log Hours'}</h3>
                <form action="${editLog ? `/api/update/${editLog.id}` : '/api/add'}" method="POST">
                    <input type="date" name="workDate" value="${editLog ? editLog.start.toISOString().split('T')[0] : todayStr}" required style="width:100%; padding:10px; margin-bottom:10px;">
                    <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px;">
                        <input type="time" name="startTime" value="${editLog && editLog.start.getTime() !== editLog.end.getTime() ? editLog.start.toISOString().slice(11,16) : ''}" style="padding:10px;">
                        <input type="time" name="endTime" value="${editLog && editLog.start.getTime() !== editLog.end.getTime() ? editLog.end.toISOString().slice(11,16) : ''}" style="padding:10px;">
                    </div>
                    <div style="text-align:center; margin:10px 0; font-size:0.7em; color:#999;">— OR MANUAL —</div>
                    <div style="display:flex; gap:10px;">
                        <input type="number" step="0.1" name="manualHours" value="${editLog && editLog.start.getTime() === editLog.end.getTime() ? editLog.hours : ''}" placeholder="Hrs" style="flex:1; padding:10px;">
                        <button type="submit" style="background:#333; color:white; border:none; padding:10px 20px; border-radius:5px; font-weight:bold;">${editLog ? 'Save' : 'Log'}</button>
                    </div>
                    ${editLog ? `<a href="/api" style="display:block; text-align:center; margin-top:10px; font-size:0.8em; color:#666;">Cancel</a>` : ''}
                </form>
            </div>

            <h3>Submitted RMPs</h3>
            ${rmps.map(r => {
                // Format date from UTC components to ensure correct date display regardless of timezone
                const date = new Date(r.filedDate);
                const month = date.getUTCMonth() + 1;
                const day = date.getUTCDate();
                const year = date.getUTCFullYear();
                const displayDate = `${month}/${day}/${year}`;
                return `
                <div class="card" style="display:flex; justify-content:space-between; align-items:center; border-left: 5px solid ${r.status === 'paid' ? '#28a745' : '#ffc107'}">
                    <div>
                        <strong>Filed: ${displayDate}</strong><br>
                        <span class="rmp-badge" style="background:${r.status === 'paid' ? '#28a745' : '#ffc107'}">${r.status}</span>
                    </div>
                    <div style="display:flex; gap:5px;">
                        <form action="/api/rmp/toggle-paid/${r.id}" method="POST"><button type="submit" style="font-size:0.7em;">${r.status === 'paid' ? 'Unpay' : 'Paid'}</button></form>
                        <form action="/api/rmp/delete/${r.id}" method="POST" onsubmit="return confirm('Unsubmit?')"><button type="submit" style="font-size:0.7em; color:red;">&times;</button></form>
                    </div>
                </div>
            `;
            }).join('')}

            <h3>History</h3>
            <table style="width:100%; border-collapse:collapse; font-size:0.9em;">
                ${logs.map(l => `
                    <tr style="border-bottom:1px solid #eee; opacity: ${l.rmpId ? '0.5' : '1'}">
                        <td style="padding:12px 0;">
                            ${l.start.toLocaleDateString()}<br>
                            <small style="color:#666;">${l.start.getTime() !== l.end.getTime() ? l.start.toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'}) + ' - ' + l.end.toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'}) : 'Manual'}</small>
                        </td>
                        <td><strong>${l.hours}h</strong></td>
                        <td align="right">
                            ${!l.rmpId ? `
                                <a href="/api?edit=${l.id}" style="text-decoration:none;">✏️</a>
                                <form action="/api/delete/${l.id}" method="POST" style="display:inline;"><button type="submit" style="background:none; border:none; color:red; cursor:pointer; font-size:1.2em;">&times;</button></form>
                            ` : '🔒'}
                        </td>
                    </tr>
                `).join('')}
            </table>
        </div>
        <script>
            document.querySelectorAll('form').forEach(f => f.addEventListener('submit', () => { document.getElementById('loader').style.display = 'flex'; }));
            
            // Profile dropdown toggle
            const profileBtn = document.getElementById('profileBtn');
            const profileDropdown = document.getElementById('profileDropdown');
            if (profileBtn && profileDropdown) {
                profileBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    profileDropdown.style.display = profileDropdown.style.display === 'none' ? 'block' : 'none';
                });
                document.addEventListener('click', () => {
                    profileDropdown.style.display = 'none';
                });
                profileDropdown.addEventListener('click', (e) => e.stopPropagation());
            }
        </script>
    `);
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