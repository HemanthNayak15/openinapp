const express = require('express');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const bodyParser = require('body-parser');
const cron = require('node-cron');
const twilio = require('twilio');

const app = express();
const PORT = process.env.PORT || 3000;

// Loading environment variables from .env file
require('dotenv').config();

// Connect to MongoDB
mongoose.connect(process.env.MONGODB_URI, { useNewUrlParser: true, useUnifiedTopology: true });
console.log( "mongodb connected");

// Load models
const User = require('./models/user');
const Task = require('./models/task');
const SubTask = require('./models/subtask');

// Middleware
app.use(bodyParser.json());

// Middleware to validate JWT token on each request
app.use(async (req, res, next) => {
  if (!req.headers.authorization) {
    return res.status(401).json({ error: 'Authorization header is missing' });
  }

  const token = req.headers.authorization.split(' ')[1];
  try {
    const decodedToken = jwt.verify(token, process.env.JWT_SECRET);
    req.user_id = decodedToken.user_id;
    next();
  } catch (error) {
    res.status(401).json({ error: 'Invalid token' });
  }
});


app.post('/task', async (req, res) => {
    try {
      var priority;
      const { title, description, due_date } = req.body ;
  
      // Validate input
      if (!title || !description || !due_date) {
        return res.status(400).json({ error: 'Title, description, and due date are required' });
      }

      const currentDate = new Date();
      const dueDate = new Date(due_date);
    
      if (dueDate.toDateString() === currentDate.toDateString()) {
        priority = 0; // Due date is today
      } else {
        const daysDifference = Math.ceil((dueDate - currentDate) / (1000 * 60 * 60 * 24));
    
        if (daysDifference <= 2) {
          priority = 1; // Due date is between tomorrow and day after tomorrow
        } else if (daysDifference <= 4) {
          priority = 2; // 3-4 days until due date
        } else {
          priority = 3; // 5+ days until due date
        }
    }
  
      // Creating a new task
      const newTask = new Task({
        title,
        description,
        due_date,
        priority,
      });
  
      // Saving the task to the database
      await newTask.save();
  
      res.status(201).json(newTask);
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: 'Internal Server Error' });
    }
  });

  app.post('/sub-task', async (req, res) => {
    try {
      const { task_id } = req.body;
  
      // Validate input
      if (!task_id) {
        return res.status(400).json({ error: 'Title, description, and due date are required' });
      }
  
      // Create a new task
      const newSubTask = new SubTask({
        task_id,
      });
  
      // Save the task to the database
      await newSubTask.save();
  
      // Return the created task as a response
      res.status(201).json(newSubTask);
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: 'Internal Server Error' });
    }
  });


  app.get('/tasks', async (req, res) => {
    try {
      const { priority, due_date, page = 1, limit = 10 } = req.query;
  
      const filters = {
       
        deleted_at: null, // Exclude soft-deleted tasks
      };

      if (due_date) {
        filters.due_date = { $gte: new Date(due_date) };
      }
  
      if (priority) {
        filters.priority = priority;
      }

      const tasks = await Task.find(filters)
        .skip((page - 1) * limit)
        .limit(parseInt(limit))
        .sort({ due_date: 1 }); // Adjust sorting as needed
  
      res.json(tasks);
    } catch (error) {
      console.error('Error fetching tasks:', error.message);
      res.status(500).json({ error: 'Internal Server Error' });
    }
  });

// API endpoint to get all user subtasks with a filter on task_id
app.get('/subtasks', async (req, res) => {
  try {
    const { task_id } = req.query;

   

    const filters={
        deleted_at: null
    }
    
    if (task_id) {
        filters.task_id = task_id;
      }

    const subtasks = await SubTask.find(filters); // Exclude soft-deleted subtasks

    res.json(subtasks);
  } catch (error) {
    console.error('Error fetching subtasks:', error.message);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// API endpoint to update a task
app.put('/updateTask', async (req, res) => {
  try {
    const { due_date, status } = req.body;
    const { task_id } = req.query;

    // Validate input
    if (!due_date && !status) {
      return res.status(400).json({ error: 'At least one of due_date or status should be provided for updating.' });
    }

    // Find the task by ID
    const task = await Task.findById(task_id);

    if (!task) {
      return res.status(404).json({ error: 'Task not found' });
    }

    // Update due_date if provided
    if (due_date) {
      task.due_date = new Date(due_date);
    }

    // Update status if provided and is a valid status value
    if (status !== undefined && ['TODO', 'DONE'].includes(status.toUpperCase())) {
      task.status = status.toUpperCase();
    }

    const subtask={}

    if(task.status="DONE"){
        subtask.status=1
    }
    
    if(task.status="TODO"){
        subtask.status=0
    }

    // Save the updated task
    await task.save();

    // Update Subtasks
    await SubTask.updateMany({ task_id: task_id }, { status: subtask.status });

    res.json(task);
  } catch (error) {
    console.error('Error updating task:', error.message);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// API endpoint to update a subtask
app.put('/updateSubtask', async (req, res) => {
  try {
    const { status } = req.body;
    const { subtask_id } = req.query;

    // Validate input
    if (status === undefined || !['0', '1'].includes(status.toString())) {
      return res.status(400).json({ error: 'Status should be provided and must be either 0 or 1.' });
    }

    // Find the subtask by ID
    const subtask = await SubTask.findById(subtask_id);

    if (!subtask) {
      return res.status(404).json({ error: 'Subtask not found' });
    }

    // Update status
    subtask.status = parseInt(status);

    // Save the updated subtask
    await subtask.save();

    res.json(subtask);
  } catch (error) {
    console.error('Error updating subtask:', error.message);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// API endpoint to soft delete a task
app.delete('/deleteTask', async (req, res) => {
  try {
    const { task_id } = req.query;

    // Find the task by ID
    const task = await Task.findById(task_id);

    if (!task) {
      return res.status(404).json({ error: 'Task not found' });
    }

    // Soft delete by updating the deleted_at field
    task.deletedAt = new Date();
    
    // Save the updated task
    await task.save();

    // Soft delete associated subtasks
    await SubTask.updateMany({ task_id: task_id }, { deletedAt: new Date() });

    res.json({ message: 'Task soft-deleted successfully' });
  } catch (error) {
    console.error('Error soft-deleting task:', error.message);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// API endpoint to soft delete a subtask
app.delete('/deleteSubtask', async (req, res) => {
  try {
    const { subtask_id } = req.query;

    // Find the subtask by ID
    const subtask = await SubTask.findById(subtask_id);

    if (!subtask) {
      return res.status(404).json({ error: 'Subtask not found' });
    }

    // Soft delete by updating the deleted_at field
    subtask.deletedAt = new Date();
    
    // Save the updated subtask
    await subtask.save();

    res.json({ message: 'Subtask soft-deleted successfully' });
  } catch (error) {
    console.error('Error soft-deleting subtask:', error.message);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});


// Schedule a cron job to update task priority based on due_date
cron.schedule('0 0 * * *', async () => {
    try {
      const tasksToUpdate = await Task.find({});
  
      tasksToUpdate.forEach(async (task) => {
        const currentDate = new Date();
        const dueDate = task.due_date;
  
        let priority;
  
        if (dueDate.toDateString() === currentDate.toDateString()) {
          priority = 0; // Due date is today
        } else {
          const daysDifference = Math.ceil((dueDate - currentDate) / (1000 * 60 * 60 * 24));
  
          if (daysDifference <= 2) {
            priority = 1; // Due date is between tomorrow and day after tomorrow
          } else if (daysDifference <= 4) {
            priority = 2; // 3-4 days until due date
          } else {
            priority = 3; // 5+ days until due date
          }
        }
  
        // Update the priority in the task
        task.priority = priority;
  
        // Save the updated task
        await task.save();
      });
  
      console.log('Task priorities updated successfully.');
    } catch (error) {
      console.error('Error updating task priorities:', error.message);
    }
  });

// Twilio account SID and auth token
const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const twilioClient = new twilio(accountSid, authToken);

// Function to make voice call
const makeVoiceCall = async (phoneNumber) => {
  try {
   
    // Use twilioClient.calls.create method to make a voice call
    const call = await twilioClient.calls.create({
      to: phoneNumber,
      from: process.env.TWILIO_PHONE_NUMBER,
      url: 'https://bc87-103-120-31-122.ngrok-free.app/twilio-voice-script', // URL with TwiML instructions for the call
      method: 'GET',
    });

    console.log(`Voice call to ${phoneNumber} initiated successfully.`);
    return call.status === 'completed';

  } catch (error) {
    console.error(`Error making voice call to ${phoneNumber}:`, error.message);
  }
};

// Scheduling a cron job for voice calling based on task due_date and user priority
cron.schedule('36 5 * * *', async () => {
  try {
    // Find tasks where due_date is in the past
    const overdueTasks = await Task.find({
      due_date: { $lt: new Date() },
      status: 'TODO', // Only call for tasks in 'TODO' status
    })

    // Iterating through overdue tasks and initiate voice calls based on user priority
    const calledUsers = new Set(); // To keep track of users who have been called

    const availableUser = await User.find().sort({ priority: 1 }).exec();


    for (const task of overdueTasks) {
      
        for(const user of availableUser ){

            // Check if the user's priority has not been called before
            if (!calledUsers.has(user.priority.toString())) {
            // Make a voice call
            const callAttended = await makeVoiceCall(user.phone_number);

            // Add the user's priority to the set to prevent calling again
            calledUsers.add(user.priority.toString());

            if (callAttended) {
                console.log(`User ${user.phone_number} attended the call. Stopping further calls.`);
                return; // Stop further calls if the user attended the call
              }
            }
        }
        calledUsers = new Set();
    }

    console.log('Voice calls initiated successfully.');
  } catch (error) {
    console.error('Error initiating voice calls:', error.message);
  }
});


// Expressing route to serve TwiML script
app.get('/twilio-voice-script', (req, res) => {
    const twiMLScript = generateTwiMLScript();
  
    if (!twiMLScript) {
      return res.status(404).send('Script not found');
    }
  
    res.header('Content-Type', 'application/xml');
    res.send(twiMLScript);
  });
  
  // Function to generate TwiML script
  function generateTwiMLScript() {
    return `
      <Response>
        <Say voice="alice">Hello, this is your generic task reminder. Please complete your task as soon as possible.</Say>
      </Response>
    `;
  }
  


// Starting the server
app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});
