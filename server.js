const express = require('express');
const bodyParser = require('body-parser');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const sharp = require('sharp');
const db = require('./database');

const app = express();
const PORT = process.env.PORT || 3000;

// 中间件
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static('public'));

// 确保uploads目录存在
const uploadsDir = path.join(__dirname, 'public', 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// 配置multer用于文件上传
const storage = multer.memoryStorage();
const upload = multer({
  storage: storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 限制10MB
  fileFilter: (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|gif|webp/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);

    if (mimetype && extname) {
      return cb(null, true);
    } else {
      cb(new Error('只允许上传图片文件（jpeg, jpg, png, gif, webp）'));
    }
  }
});

// 图片压缩函数
async function compressImage(buffer, outputPath) {
  try {
    await sharp(buffer)
      .resize(1920, 1920, {
        fit: 'inside',
        withoutEnlargement: true
      })
      .jpeg({ quality: 80 })
      .toFile(outputPath);
    return true;
  } catch (error) {
    console.error('图片压缩失败:', error);
    return false;
  }
}

// 图片上传路由
app.post('/api/upload-image', upload.single('image'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: '没有上传文件' });
  }

  try {
    // 生成唯一文件名
    const timestamp = Date.now();
    const randomStr = Math.random().toString(36).substring(2, 15);
    const filename = `${timestamp}_${randomStr}.jpg`;
    const outputPath = path.join(uploadsDir, filename);

    // 压缩图片
    const success = await compressImage(req.file.buffer, outputPath);

    if (success) {
      // 返回图片URL
      const imageUrl = `/uploads/${filename}`;
      res.json({ imageUrl, message: '图片上传成功' });
    } else {
      res.status(500).json({ error: '图片处理失败' });
    }
  } catch (error) {
    console.error('图片上传错误:', error);
    res.status(500).json({ error: '图片上传失败' });
  }
});

// 静态文件服务 - 提供uploads目录的访问
app.use('/uploads', express.static(uploadsDir));

// API 路由

// 获取所有车辆
app.get('/api/vehicles', (req, res) => {
  db.getAllVehicles((err, vehicles) => {
    if (err) {
      res.status(500).json({ error: err.message });
    } else {
      res.json(vehicles);
    }
  });
});

// 添加车辆
app.post('/api/vehicles', (req, res) => {
  const { name, current_mileage } = req.body;
  if (!name || current_mileage === undefined) {
    return res.status(400).json({ error: '车辆名称和当前里程数为必填项' });
  }
  db.addVehicle(name, parseFloat(current_mileage), (err, id) => {
    if (err) {
      res.status(500).json({ error: err.message });
    } else {
      res.json({ id, message: '车辆添加成功' });
    }
  });
});

// 删除车辆
app.delete('/api/vehicles/:id', (req, res) => {
  const vehicleId = parseInt(req.params.id);
  db.deleteVehicle(vehicleId, (err) => {
    if (err) {
      res.status(500).json({ error: err.message });
    } else {
      res.json({ message: '车辆删除成功' });
    }
  });
});

// 设置/取消车辆密码
app.post('/api/vehicles/:id/password', (req, res) => {
  const vehicleId = parseInt(req.params.id);
  const { password } = req.body; // 可以为 null 表示取消密码
  db.updateVehiclePassword(vehicleId, password, (err) => {
    if (err) {
      res.status(500).json({ error: err.message });
    } else {
      res.json({ message: password ? '密码设置成功' : '密码已取消' });
    }
  });
});

// 验证车辆密码
app.post('/api/vehicles/:id/verify-password', (req, res) => {
  const vehicleId = parseInt(req.params.id);
  const { password } = req.body;
  db.getAllVehicles((err, vehicles) => {
    if (err) {
      res.status(500).json({ error: err.message });
    } else {
      const vehicle = vehicles.find(v => v.id === vehicleId);
      if (!vehicle) {
        res.status(404).json({ error: '车辆不存在' });
      } else if (vehicle.password === password) {
        res.json({ success: true });
      } else {
        res.status(401).json({ success: false, error: '密码错误' });
      }
    }
  });
});

// 获取车辆的加油记录
app.get('/api/vehicles/:id/records', (req, res) => {
  const vehicleId = parseInt(req.params.id);
  db.getRefuelRecords(vehicleId, (err, records) => {
    if (err) {
      res.status(500).json({ error: err.message });
    } else {
      res.json(records);
    }
  });
});

// 添加加油记录
app.post('/api/vehicles/:id/records', (req, res) => {
  const vehicleId = parseInt(req.params.id);
  const { liters, price, mileage, refuel_date, image_path } = req.body;
  // 允许liters和price为0（初始记录），只检查是否为undefined
  if (liters === undefined || price === undefined || mileage === undefined) {
    return res.status(400).json({ error: '升数、价格和里程数为必填项' });
  }
  db.addRefuelRecord(
    vehicleId,
    parseFloat(liters),
    parseFloat(price),
    parseFloat(mileage),
    refuel_date,
    image_path || null,
    (err, id) => {
      if (err) {
        res.status(500).json({ error: err.message });
      } else {
        res.json({ id, message: '加油记录添加成功' });
      }
    }
  );
});

// 更新加油记录
app.put('/api/records/:id', (req, res) => {
  const recordId = parseInt(req.params.id);
  const { liters, price, mileage, refuel_date, image_path } = req.body;
  if (!liters || !price || mileage === undefined || !refuel_date) {
    return res.status(400).json({ error: '所有字段为必填项' });
  }
  db.updateRefuelRecord(
    recordId,
    parseFloat(liters),
    parseFloat(price),
    parseFloat(mileage),
    refuel_date,
    image_path || null,
    (err) => {
      if (err) {
        res.status(500).json({ error: err.message });
      } else {
        res.json({ message: '加油记录更新成功' });
      }
    }
  );
});

// 删除加油记录
app.delete('/api/records/:id', (req, res) => {
  const recordId = parseInt(req.params.id);
  db.deleteRefuelRecord(recordId, (err) => {
    if (err) {
      res.status(500).json({ error: err.message });
    } else {
      res.json({ message: '加油记录删除成功' });
    }
  });
});

// 清空车辆的加油记录
app.delete('/api/vehicles/:id/records', (req, res) => {
  const vehicleId = parseInt(req.params.id);
  db.clearRefuelRecords(vehicleId, (err) => {
    if (err) {
      res.status(500).json({ error: err.message });
    } else {
      res.json({ message: '加油记录清空成功' });
    }
  });
});

// 清空车辆的额外消费记录
app.delete('/api/vehicles/:id/expenses', (req, res) => {
  const vehicleId = parseInt(req.params.id);
  db.clearExtraExpenses(vehicleId, (err) => {
    if (err) {
      res.status(500).json({ error: err.message });
    } else {
      res.json({ message: '额外消费记录清空成功' });
    }
  });
});

// 获取车辆统计信息
app.get('/api/vehicles/:id/stats', (req, res) => {
  const vehicleId = parseInt(req.params.id);
  db.getVehicleStats(vehicleId, (err, stats) => {
    if (err) {
      res.status(500).json({ error: err.message });
    } else {
      res.json(stats);
    }
  });
});

// 获取所有加油记录（用于全局统计）
app.get('/api/records', (req, res) => {
  db.getAllRefuelRecords((err, records) => {
    if (err) {
      res.status(500).json({ error: err.message });
    } else {
      res.json(records);
    }
  });
});

// 获取车辆的额外消费记录
app.get('/api/vehicles/:id/expenses', (req, res) => {
  const vehicleId = parseInt(req.params.id);
  db.getExtraExpenses(vehicleId, (err, expenses) => {
    if (err) {
      res.status(500).json({ error: err.message });
    } else {
      res.json(expenses);
    }
  });
});

// 添加额外消费记录
app.post('/api/vehicles/:id/expenses', (req, res) => {
  const vehicleId = parseInt(req.params.id);
  const { title, amount, expense_date, image_path } = req.body;
  if (!title || amount === undefined) {
    return res.status(400).json({ error: '标题和金额为必填项' });
  }
  db.addExtraExpense(
    vehicleId,
    title,
    parseFloat(amount),
    expense_date,
    image_path || null,
    (err, id) => {
      if (err) {
        res.status(500).json({ error: err.message });
      } else {
        res.json({ id, message: '额外消费记录添加成功' });
      }
    }
  );
});

// 更新额外消费记录
app.put('/api/expenses/:id', (req, res) => {
  const expenseId = parseInt(req.params.id);
  const { title, amount, expense_date, image_path } = req.body;
  if (!title || amount === undefined || !expense_date) {
    return res.status(400).json({ error: '所有字段为必填项' });
  }
  db.updateExtraExpense(
    expenseId,
    title,
    parseFloat(amount),
    expense_date,
    image_path || null,
    (err) => {
      if (err) {
        res.status(500).json({ error: err.message });
      } else {
        res.json({ message: '额外消费记录更新成功' });
      }
    }
  );
});

// 删除额外消费记录
app.delete('/api/expenses/:id', (req, res) => {
  const expenseId = parseInt(req.params.id);
  db.deleteExtraExpense(expenseId, (err) => {
    if (err) {
      res.status(500).json({ error: err.message });
    } else {
      res.json({ message: '额外消费记录删除成功' });
    }
  });
});

// 获取车辆额外消费统计
app.get('/api/vehicles/:id/expense-stats', (req, res) => {
  const vehicleId = parseInt(req.params.id);
  db.getExtraExpenseStats(vehicleId, (err, stats) => {
    if (err) {
      res.status(500).json({ error: err.message });
    } else {
      res.json(stats);
    }
  });
});

// 获取车辆的维保设置
app.get('/api/vehicles/:id/maintenance-settings', (req, res) => {
  const vehicleId = parseInt(req.params.id);
  db.getMaintenanceSettings(vehicleId, (err, settings) => {
    if (err) {
      res.status(500).json({ error: err.message });
    } else {
      res.json(settings);
    }
  });
});

// 添加维保设置
app.post('/api/vehicles/:id/maintenance-settings', (req, res) => {
  const vehicleId = parseInt(req.params.id);
  const { interval_km, description } = req.body;
  if (!interval_km || interval_km <= 0) {
    return res.status(400).json({ error: '维保间隔里程数为必填项且必须大于0' });
  }
  db.addMaintenanceSetting(vehicleId, parseFloat(interval_km), description, (err, id) => {
    if (err) {
      res.status(500).json({ error: err.message });
    } else {
      res.json({ id, message: '维保设置添加成功' });
    }
  });
});

// 删除维保设置
app.delete('/api/maintenance-settings/:id', (req, res) => {
  const settingId = parseInt(req.params.id);
  db.deleteMaintenanceSetting(settingId, (err) => {
    if (err) {
      res.status(500).json({ error: err.message });
    } else {
      res.json({ message: '维保设置删除成功' });
    }
  });
});

// 获取车辆的维保记录
app.get('/api/vehicles/:id/maintenance-records', (req, res) => {
  const vehicleId = parseInt(req.params.id);
  db.getMaintenanceRecords(vehicleId, (err, records) => {
    if (err) {
      res.status(500).json({ error: err.message });
    } else {
      res.json(records);
    }
  });
});

// 添加维保记录
app.post('/api/vehicles/:id/maintenance-records', (req, res) => {
  const vehicleId = parseInt(req.params.id);
  const { mileage, description, amount, maintenance_date, image_path } = req.body;
  if (!mileage || !amount || amount < 0) {
    return res.status(400).json({ error: '里程数和金额为必填项' });
  }
  db.addMaintenanceRecord(vehicleId, parseFloat(mileage), description, parseFloat(amount), maintenance_date, image_path || null, (err, id) => {
    if (err) {
      res.status(500).json({ error: err.message });
    } else {
      res.json({ id, message: '维保记录添加成功' });
    }
  });
});

// 更新维保记录
app.put('/api/maintenance-records/:id', (req, res) => {
  const recordId = parseInt(req.params.id);
  const { mileage, description, amount, maintenance_date, image_path } = req.body;
  if (!mileage || !amount || amount < 0 || !maintenance_date) {
    return res.status(400).json({ error: '所有字段为必填项' });
  }
  db.updateMaintenanceRecord(recordId, parseFloat(mileage), description, parseFloat(amount), maintenance_date, image_path || null, (err) => {
    if (err) {
      res.status(500).json({ error: err.message });
    } else {
      res.json({ message: '维保记录更新成功' });
    }
  });
});

// 删除维保记录
app.delete('/api/maintenance-records/:id', (req, res) => {
  const recordId = parseInt(req.params.id);
  db.deleteMaintenanceRecord(recordId, (err) => {
    if (err) {
      res.status(500).json({ error: err.message });
    } else {
      res.json({ message: '维保记录删除成功' });
    }
  });
});

// 获取车辆维保提醒信息
app.get('/api/vehicles/:id/maintenance-alerts', (req, res) => {
  const vehicleId = parseInt(req.params.id);

  // 获取车辆当前里程
  db.getAllVehicles((err, vehicles) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }

    const vehicle = vehicles.find(v => v.id === vehicleId);
    if (!vehicle) {
      return res.status(404).json({ error: '车辆不存在' });
    }

    const currentMileage = vehicle.current_mileage;

    // 获取维保设置
    db.getMaintenanceSettings(vehicleId, (err, settings) => {
      if (err) {
        return res.status(500).json({ error: err.message });
      }

      // 获取维保记录
      db.getMaintenanceRecords(vehicleId, (err, records) => {
        if (err) {
          return res.status(500).json({ error: err.message });
        }

        // 获取车辆初始里程（从加油记录中获取最小里程）
        db.getRefuelRecords(vehicleId, (err2, refuelRecords) => {
          if (err2) {
            return res.status(500).json({ error: err2.message });
          }

          const alerts = [];

          // 找到最小里程（初始里程）
          const initialMileage = refuelRecords.length > 0
            ? Math.min(...refuelRecords.map(r => r.mileage))
            : currentMileage;

          for (const setting of settings) {
            // 找到该维保间隔的最后一次维保记录
            const relevantRecords = records.filter(r => r.mileage <= currentMileage);
            const lastMaintenance = relevantRecords.length > 0
              ? relevantRecords.reduce((max, r) => r.mileage > max.mileage ? r : max, relevantRecords[0])
              : null;

            // 如果没有任何维保记录，从初始里程开始计算
            const lastMaintenanceMileage = lastMaintenance ? lastMaintenance.mileage : initialMileage;

            // 计算下次应该维保的里程（基于上次维保里程 + 间隔）
            const nextMaintenanceMileage = lastMaintenanceMileage + setting.interval_km;
            const mileageSinceLastMaintenance = currentMileage - lastMaintenanceMileage;

            // 如果当前里程已达到或超过下次维保里程，则提醒
            if (currentMileage >= nextMaintenanceMileage) {
              const overdueKm = currentMileage - nextMaintenanceMileage;
              alerts.push({
                setting_id: setting.id,
                interval_km: setting.interval_km,
                description: setting.description,
                last_maintenance_mileage: lastMaintenanceMileage,
                next_maintenance_mileage: nextMaintenanceMileage,
                current_mileage: currentMileage,
                mileage_since_last: mileageSinceLastMaintenance,
                overdue_km: overdueKm,
                is_overdue: true
              });
            }
          }

          res.json(alerts);
        });
      });
    });
  });
});

// 启动服务器
app.listen(PORT, () => {
  console.log(`服务器运行在 http://localhost:${PORT}`);
});


