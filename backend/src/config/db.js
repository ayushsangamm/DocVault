import mongoose from 'mongoose';
import { env } from './env.js';

/**
 * MongoDB Database Connection Manager
 * 
 * WHY: Strict connection lifecycle management ensures that we gracefully recover
 * from transient network drops and properly terminate pool connections during testing
 * and process teardown.
 */
export async function connectDB() {
  try {
    const conn = await mongoose.connect(env.MONGODB_URI, {
      autoIndex: true, // Automatically build indexes defined in schemas
    });
    console.log(`[Database] MongoDB Connected: ${conn.connection.host}/${conn.connection.name}`);
    return conn;
  } catch (error) {
    console.error(`[Database Error] Connection failed: ${error.message}`);
    throw error;
  }
}

export async function disconnectDB() {
  try {
    await mongoose.disconnect();
    console.log('[Database] MongoDB Disconnected gracefully');
  } catch (error) {
    console.error(`[Database Error] Disconnect failed: ${error.message}`);
  }
}
