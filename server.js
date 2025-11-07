const express = require('express');
const cors = require('cors');
const fs = require('fs').promises;
const path = require('path');

const app = express();

app.use(cors());
app.use(express.json());

// 静态文件服务
app.use(express.static('public'));

// 数据目录路径
const DATA_DIR = path.join(process.cwd(), 'data');

// 内存中的数据存储
let appointments = [];
let isSystemActive = false;

// 确保数据目录存在
async function ensureDataDir() {
  try {
    await fs.access(DATA_DIR);
  } catch {
    await fs.mkdir(DATA_DIR, { recursive: true });
  }
}

// 加载预约数据
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

// 保存预约数据
async function saveAppointments() {
  try {
    await ensureDataDir();
    const today = new Date().toISOString().split('T')[0];
    const filePath = path.join(DATA_DIR, `appointments_${today}.json`);
    await fs.writeFile(filePath, JSON.stringify(appointments, null, 2));
  } catch (error) {
    console.error('保存数据失败:', error);
  }
}

// 保存历史记录
async function saveHistory(appointment, action) {
  try {
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
  } catch (error) {
    console.error('保存历史记录失败:', error);
  }
}

// 检查系统时间
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
}

// 获取当前显示的预约
function getCurrentDisplay() {
  return appointments
    .filter(apt => !apt.isOutbound)
    .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp))
    .slice(0, 4);
}

// API路由

// 创建预约
app.post('/api/appointments', async (req, res) => {
  try {
    await loadAppointments();
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

    res.json({ success: true, appointment });
  } catch (error) {
    res.status(500).json({ error: '预约失败' });
  }
});

// 标记出库
app.post('/api/outbound/:id', async (req, res) => {
  try {
    await loadAppointments();
    const appointmentId = req.params.id;
    const appointment = appointments.find(apt => apt.id === appointmentId);

    if (!appointment) {
      return res.status(404).json({ error: '预约记录未找到' });
    }

    appointment.isOutbound = true;
    appointment.outboundTime = new Date().toISOString();

    await saveAppointments();
    await saveHistory(appointment, 'outbound');

    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: '出库操作失败' });
  }
});

// 获取预约列表
app.get('/api/appointments', async (req, res) => {
  try {
    await loadAppointments();
    checkSystemTime();

    const currentDisplay = getCurrentDisplay();

    res.json({
      appointments: appointments.filter(apt => !apt.isOutbound),
      currentDisplay,
      systemActive: isSystemActive,
      totalWaiting: appointments.filter(apt => !apt.isOutbound).length
    });
  } catch (error) {
    res.status(500).json({ error: '获取预约列表失败' });
  }
});

// 获取历史记录
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

// 获取系统状态
app.get('/api/status', async (req, res) => {
  try {
    await loadAppointments();
    checkSystemTime();

    const currentDisplay = getCurrentDisplay();

    res.json({
      systemActive: isSystemActive,
      currentTime: new Date().toISOString(),
      totalWaiting: appointments.filter(apt => !apt.isOutbound).length,
      currentDisplay
    });
  } catch (error) {
    res.status(500).json({ error: '获取系统状态失败' });
  }
});

// 健康检查
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// 根路由处理
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// 处理其他页面路由
app.get('/display.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'display.html'));
});

app.get('/history.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'history.html'));
});

// 初始化
async function init() {
  await loadAppointments();
  checkSystemTime();
}

init();

// 本地开发服务器
if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`服务器运行在端口 ${PORT}`);
  });
}

module.exports = app;