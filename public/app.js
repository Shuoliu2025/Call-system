// 主应用逻辑
class CallSystem {
    constructor() {
        this.initEventListeners();
        this.initPolling();
    }

    initEventListeners() {
        const form = document.getElementById('appointmentForm');
        if (form) {
            form.addEventListener('submit', this.handleAppointmentSubmit.bind(this));
        }
    }

    initPolling() {
        // 初始加载数据
        this.loadSystemStatus();

        // 每5秒轮询一次数据
        setInterval(() => {
            this.loadSystemStatus();
        }, 5000);
    }

    async loadSystemStatus() {
        try {
            const response = await fetch('/api/status');
            const data = await response.json();
            this.updateQueueInfo(data);
        } catch (error) {
            console.error('获取系统状态失败:', error);
        }
    }

    async handleAppointmentSubmit(event) {
        event.preventDefault();

        const submitBtn = event.target.querySelector('.submit-btn');
        const btnText = submitBtn.querySelector('.btn-text');
        const btnLoading = submitBtn.querySelector('.btn-loading');

        // 获取表单数据
        const formData = new FormData(event.target);
        const appointmentData = {
            name: formData.get('name'),
            phone: formData.get('phone'),
            licensePlate: formData.get('licensePlate').toUpperCase(),
            isOutbound: formData.get('isOutbound') === 'on'
        };

        // 验证数据
        if (!this.validateAppointmentData(appointmentData)) {
            return;
        }

        // 设置加载状态
        submitBtn.disabled = true;
        btnText.style.display = 'none';
        btnLoading.style.display = 'inline';

        try {
            const response = await fetch('/api/appointments', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(appointmentData)
            });

            const result = await response.json();

            if (result.success) {
                this.showMessage('预约成功！', 'success');
                event.target.reset();
            } else {
                this.showMessage(result.error || '预约失败，请重试', 'error');
            }
        } catch (error) {
            this.showMessage('网络错误，请检查连接', 'error');
        } finally {
            // 恢复按钮状态
            submitBtn.disabled = false;
            btnText.style.display = 'inline';
            btnLoading.style.display = 'none';
        }
    }

    validateAppointmentData(data) {
        // 验证姓名
        if (!data.name || data.name.trim().length < 2) {
            this.showMessage('请输入有效的姓名（至少2个字符）', 'error');
            return false;
        }

        // 验证手机号
        const phonePattern = /^1[3-9]\d{9}$/;
        if (!phonePattern.test(data.phone)) {
            this.showMessage('请输入有效的11位手机号', 'error');
            return false;
        }

        // 验证车牌号
        const licensePlatePattern = /^[京津沪渝冀豫云辽黑湘皖鲁新苏浙赣鄂桂甘晋蒙陕吉闽贵粤青藏川宁琼使领][A-Z][A-Z0-9]{4}[A-Z0-9挂学警港澳]$/;
        if (!licensePlatePattern.test(data.licensePlate)) {
            this.showMessage('请输入有效的车牌号（如：京A12345）', 'error');
            return false;
        }

        return true;
    }

    updateQueueInfo(data) {
        const waitingCountElement = document.getElementById('waitingCount');
        const systemStatusElement = document.getElementById('systemStatus');

        if (waitingCountElement) {
            waitingCountElement.textContent = data.totalWaiting || 0;
        }

        if (systemStatusElement) {
            systemStatusElement.textContent = data.systemActive ? '运行中' : '未开始';
            systemStatusElement.className = data.systemActive ? 'status-active' : 'status-inactive';
        }
    }

    showMessage(text, type = 'success') {
        // 创建toast消息
        const toast = document.createElement('div');
        toast.className = `message-toast ${type}`;
        toast.textContent = text;

        document.body.appendChild(toast);

        // 显示动画
        setTimeout(() => {
            toast.classList.add('show');
        }, 100);

        // 自动隐藏
        setTimeout(() => {
            toast.classList.remove('show');
            setTimeout(() => {
                if (document.body.contains(toast)) {
                    document.body.removeChild(toast);
                }
            }, 300);
        }, 3000);
    }

    // 格式化时间
    static formatTime(dateString) {
        const date = new Date(dateString);
        return date.toLocaleString('zh-CN', {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit'
        });
    }

    // 格式化车牌号
    static formatLicensePlate(plate) {
        return plate.toUpperCase().replace(/[^A-Z0-9\u4e00-\u9fa5]/g, '');
    }
}

// DOM加载完成后初始化应用
document.addEventListener('DOMContentLoaded', () => {
    const app = new CallSystem();

    // 车牌号输入格式化
    const licensePlateInput = document.getElementById('licensePlate');
    if (licensePlateInput) {
        licensePlateInput.addEventListener('input', (e) => {
            e.target.value = CallSystem.formatLicensePlate(e.target.value);
        });
    }

    // 手机号输入限制
    const phoneInput = document.getElementById('phone');
    if (phoneInput) {
        phoneInput.addEventListener('input', (e) => {
            e.target.value = e.target.value.replace(/[^0-9]/g, '').slice(0, 11);
        });
    }

    // 姓名输入过滤
    const nameInput = document.getElementById('name');
    if (nameInput) {
        nameInput.addEventListener('input', (e) => {
            e.target.value = e.target.value.replace(/[^a-zA-Z0-9\u4e00-\u9fa5]/g, '');
        });
    }
});

// 全局工具函数
window.CallSystemUtils = {
    formatTime: CallSystem.formatTime,
    formatLicensePlate: CallSystem.formatLicensePlate,

    // 复制到剪贴板
    copyToClipboard: (text) => {
        if (navigator.clipboard) {
            navigator.clipboard.writeText(text).then(() => {
                console.log('已复制到剪贴板');
            });
        } else {
            // 降级方案
            const textArea = document.createElement('textarea');
            textArea.value = text;
            document.body.appendChild(textArea);
            textArea.select();
            document.execCommand('copy');
            document.body.removeChild(textArea);
        }
    },

    // 获取当前时间
    getCurrentTime: () => {
        return new Date().toLocaleString('zh-CN');
    },

    // 检查是否在工作时间
    isWorkingHours: () => {
        const now = new Date();
        const hour = now.getHours();
        const minute = now.getMinutes();

        return (hour === 8 && minute >= 30) || (hour > 8 && hour < 18);
    }
};