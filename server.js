const express = require('express');
const bodyParser = require('body-parser');
const path = require('path');
const db = require('./database');

const app = express();
const PORT = process.env.PORT || 3000;

// 中间件
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static('public'));

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
  const { liters, price, mileage, refuel_date } = req.body;
  if (!liters || !price || mileage === undefined) {
    return res.status(400).json({ error: '升数、价格和里程数为必填项' });
  }
  db.addRefuelRecord(
    vehicleId,
    parseFloat(liters),
    parseFloat(price),
    parseFloat(mileage),
    refuel_date,
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
  const { liters, price, mileage, refuel_date } = req.body;
  if (!liters || !price || mileage === undefined || !refuel_date) {
    return res.status(400).json({ error: '所有字段为必填项' });
  }
  db.updateRefuelRecord(
    recordId,
    parseFloat(liters),
    parseFloat(price),
    parseFloat(mileage),
    refuel_date,
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
  const { title, amount, expense_date } = req.body;
  if (!title || amount === undefined) {
    return res.status(400).json({ error: '标题和金额为必填项' });
  }
  db.addExtraExpense(
    vehicleId,
    title,
    parseFloat(amount),
    expense_date,
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
  const { title, amount, expense_date } = req.body;
  if (!title || amount === undefined || !expense_date) {
    return res.status(400).json({ error: '所有字段为必填项' });
  }
  db.updateExtraExpense(
    expenseId,
    title,
    parseFloat(amount),
    expense_date,
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

// 启动服务器
app.listen(PORT, () => {
  console.log(`服务器运行在 http://localhost:${PORT}`);
});


