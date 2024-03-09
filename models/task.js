const mongoose = require('mongoose');

const taskSchema = new mongoose.Schema({
  title: { type: String, required: true },
  description: { type: String, required: true },
  due_date: { type: Date, required: true },
  priority: { type: Number, enum: [0, 1, 2, 3] },
  status: { type: String, enum: ['TODO', 'IN_PROGRESS', 'DONE'], default: 'TODO' },
  deletedAt: { type: Date },
}, { timestamps: true });

const Task = mongoose.model('Task', taskSchema);

module.exports = Task;