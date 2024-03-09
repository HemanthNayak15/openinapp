const mongoose = require('mongoose');

const subTaskSchema = new mongoose.Schema({
  task_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Task', required: true },
  status: { type: Number, enum: [0, 1], default: 0 },
  deletedAt: { type: Date,   },
}, { timestamps: true });

const SubTask = mongoose.model('SubTask', subTaskSchema);

module.exports = SubTask;