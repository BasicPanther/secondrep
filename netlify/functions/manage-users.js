import { MongoClient } from 'mongodb';

const mongoUri = process.env.MONGODB_URI;
const dbName = process.env.MONGODB_DB || 'event_bands_db';

let cachedClient = null;

async function connectToDatabase() {
  if (cachedClient) return cachedClient;
  const client = new MongoClient(mongoUri);
  await client.connect();
  cachedClient = client;
  return client;
}

export default async (request) => {
  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      },
    });
  }

  try {
    const client = await connectToDatabase();
    const db = client.db(dbName);
    const collection = db.collection('users');

    // GET - Fetch all users
    if (request.method === 'GET') {
      const users = await collection.find({}).toArray();
      return new Response(
        JSON.stringify({
          success: true,
          data: users.map(u => ({
            _id: u._id.toString(),
            username: u.username,
            password: u.password,
            isAdmin: u.isAdmin || false,
            role: u.role || 'unassigned', // Backward compatible
            createdAt: u.createdAt || new Date()
          }))
        }),
        {
          status: 200,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
          },
        }
      );
    }

    // POST - Create new user
    if (request.method === 'POST') {
      const body = await request.text();
      const data = JSON.parse(body);
      
      const { username, password, role = 'unassigned' } = data;

      if (!username || !password) {
        return new Response(
          JSON.stringify({ success: false, error: 'Username and password required' }),
          { status: 400, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } }
        );
      }

      const existing = await collection.findOne({ username });
      if (existing) {
        return new Response(
          JSON.stringify({ success: false, error: 'User already exists' }),
          { status: 409, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } }
        );
      }

      const result = await collection.insertOne({
        username,
        password,
        isAdmin: false,
        role, // New field
        createdAt: new Date()
      });

      return new Response(
        JSON.stringify({
          success: true,
          id: result.insertedId.toString(),
          message: `User '${username}' created with role '${role}'`
        }),
        {
          status: 201,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
          },
        }
      );
    }

    // PUT - Update user
    if (request.method === 'PUT') {
      const body = await request.text();
      const data = JSON.parse(body);
      
      const { userId, username, password, role } = data;

      if (!userId) {
        return new Response(
          JSON.stringify({ success: false, error: 'User ID required' }),
          { status: 400, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } }
        );
      }

      const updateData = {};
      if (username !== undefined) updateData.username = username;
      if (password !== undefined) updateData.password = password;
      if (role !== undefined) updateData.role = role;

      const { ObjectId } = await import('mongodb');
      const result = await collection.updateOne(
        { _id: new ObjectId(userId) },
        { $set: updateData }
      );

      if (result.matchedCount === 0) {
        return new Response(
          JSON.stringify({ success: false, error: 'User not found' }),
          { status: 404, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } }
        );
      }

      return new Response(
        JSON.stringify({
          success: true,
          message: 'User updated successfully'
        }),
        {
          status: 200,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
          },
        }
      );
    }

    // DELETE - Delete user
    if (request.method === 'DELETE') {
      const url = new URL(request.url);
      const username = url.searchParams.get('username');

      if (!username) {
        return new Response(
          JSON.stringify({ success: false, error: 'Username required' }),
          { status: 400, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } }
        );
      }

      if (username === 'admin') {
        return new Response(
          JSON.stringify({ success: false, error: 'Cannot delete admin user' }),
          { status: 403, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } }
        );
      }

      // Delete user
      const result = await collection.deleteOne({ username });

      if (result.deletedCount === 0) {
        return new Response(
          JSON.stringify({ success: false, error: 'User not found' }),
          { status: 404, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } }
        );
      }

      // Also delete all entries by this user
      const entriesCollection = db.collection(process.env.MONGODB_COLLECTION || 'entries');
      await entriesCollection.deleteMany({ userId: username });

      return new Response(
        JSON.stringify({
          success: true,
          message: `User '${username}' and their data deleted`
        }),
        {
          status: 200,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
          },
        }
      );
    }

    return new Response(
      JSON.stringify({ success: false, error: 'Method not allowed' }),
      { status: 405, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } }
    );
  } catch (error) {
    console.error('Error:', error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      {
        status: 500,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
      }
    );
  }
};
