const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const cron = require('node-cron');
const fs = require('fs').promises;
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

const PORT = process.env.PORT || 3000;
const DATA_DIR = path.join(__dirname, 'data');

app.use(cors());
app.use(express.json());
app.use(express.static('public'));

let appointments = [];
let currentDisplay = [];
let isSystemActive = false;

async function ensureDataDir() {
  try {
    await fs.access(DATA_DIR);
  } catch {
    await fs.mkdir(DATA_DIR, { recursive: true });
  }
}

async function loadAppointments() {
  try {
    const today = new Date().toISOString().split('T')[0];
    const filePath = path.join(DATA_DIR, `appointments_${today}.json`);
    const data = await fs.readFile(filePath, 'utf8');
    appointments = JSON.parse(data);
  } catch (error) {
    appointments = [];
  }
}

async function saveAppointments() {
  await ensureDataDir();
  const today = new Date().toISOString().split('T')[0];
  const filePath = path.join(DATA_DIR, `appointments_${today}.json`);
  await fs.writeFile(filePath, JSON.stringify(appointments, null, 2));
}

async function saveHistory(appointment, action) {
  await ensureDataDir();
  const today = new Date().toISOString().split('T')[0];
  const historyPath = path.join(DATA_DIR, `history_${today}.json`);

  let history = [];
  try {
    const data = await fs.readFile(historyPath, 'utf8');
    history = JSON.parse(data);
  } catch (error) {
    history = [];
  }

  history.push({
    ...appointment,
    action,
    timestamp: new Date().toISOString()
  });

  await fs.writeFile(historyPath, JSON.stringify(history, null, 2));
}

function updateDisplay() {
  currentDisplay = appointments
    .filter(apt => !apt.isOutbound)
    .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp))
    .slice(0, 4);

  io.emit('displayUpdate', {
    appointments: currentDisplay,
    totalWaiting: appointments.filter(apt => !apt.isOutbound).length,
    systemActive: isSystemActive
  });
}

function checkSystemTime() {
  const now = new Date();
  const currentHour = now.getHours();
  const currentMinute = now.getMinutes();

  if (currentHour === 8 && currentMinute >= 30) {
    isSystemActive = true;
  } else if (currentHour > 8 && currentHour < 18) {
    isSystemActive = true;
  } else {
    isSystemActive = false;
  }

  updateDisplay();
}

app.post('/api/appointments', async (req, res) => {
  try {
    const { name, phone, licensePlate, isOutbound } = req.body;

    if (!name || !phone || !licensePlate) {
      return res.status(400).json({ error: '所有字段都是必填的' });
    }

    const appointment = {
      id: Date.now().toString(),
      name,
      phone,
      licensePlate,
      isOutbound: isOutbound || false,
      timestamp: new Date().toISOString(),
      displayTime: null,
      outboundTime: null
    };

    appointments.push(appointment);
    await saveAppointments();

    if (!appointment.isOutbound) {
      updateDisplay();
    }

    res.json({ success: true, appointment });
  } catch (error) {
    res.status(500).json({ error: '预约失败' });
  }
});

app.post('/api/outbound/:id', async (req, res) => {
  try {
    const appointmentId = req.params.id;
    const appointment = appointments.find(apt => apt.id === appointmentId);

    if (!appointment) {
      return res.status(404).json({ error: '预约记录未找到' });
    }

    appointment.isOutbound = true;
    appointment.outboundTime = new Date().toISOString();

    await saveAppointments();
    await saveHistory(appointment, 'outbound');

    updateDisplay();

    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: '出库操作失败' });
  }
});

app.get('/api/appointments', (req, res) => {
  res.json({
    appointments: appointments.filter(apt => !apt.isOutbound),
    currentDisplay,
    systemActive: isSystemActive
  });
});

app.get('/api/history', async (req, res) => {
  try {
    const today = new Date().toISOString().split('T')[0];
    const historyPath = path.join(DATA_DIR, `history_${today}.json`);

    try {
      const data = await fs.readFile(historyPath, 'utf8');
      res.json(JSON.parse(data));
    } catch (error) {
      res.json([]);
    }
  } catch (error) {
    res.status(500).json({ error: '获取历史记录失败' });
  }
});

cron.schedule('*/1 * * * *', () => {
  checkSystemTime();
});

cron.schedule('0 0 * * *', async () => {
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayStr = yesterday.toISOString().split('T')[0];

  await saveHistory(appointments, 'daily_save');
  appointments = [];
  await saveAppointments();
});

io.on('connection', (socket) => {
  console.log('用户连接:', socket.id);

  socket.emit('displayUpdate', {
    appointments: currentDisplay,
    totalWaiting: appointments.filter(apt => !apt.isOutbound).length,
    systemActive: isSystemActive
  });

  socket.on('disconnect', () => {
    console.log('用户断开连接:', socket.id);
  });
});

async function init() {
  await loadAppointments();
  checkSystemTime();

  server.listen(PORT, () => {
    console.log(`自动叫号系统运行在端口 ${PORT}`);
    console.log(`访问地址: http://localhost:${PORT}`);
  });
}

init();