import { MongoClient, ObjectId } from 'mongodb';

const mongoUri = process.env.MONGODB_URI;
const dbName = process.env.MONGODB_DB || 'event_bands_db';
const usersCollectionName = 'users';
const entriesCollectionName = process.env.MONGODB_COLLECTION || 'entries';

let cachedClient = null;

async function connectToDatabase() {
  if (cachedClient) return cachedClient;
  const client = new MongoClient(mongoUri);
  await client.connect();
  cachedClient = client;
  return client;
}

export default async (request) => {
  // CORS Handling
  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET,POST,DELETE,OPTIONS,PUT',
        'Access-Control-Allow-Headers': 'Content-Type',
      },
    });
  }

  try {
    const client = await connectToDatabase();
    const db = client.db(dbName);
    const usersCollection = db.collection(usersCollectionName);

    // GET - Fetch all users
    if (request.method === 'GET') {
      const users = await usersCollection.find({}).toArray();
      
      return new Response(
        JSON.stringify({
          success: true,
          data: users.map(u => ({
            _id: u._id.toString(),
            username: u.username,
            isAdmin: u.isAdmin,
            password: u.password,
            role: u.role || 'Desk', // Support for legacy data: defaults to 'Desk'
            createdAt: u.createdAt
          }))
        }),
        {
          status: 200,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*'
          }
        }
      );
    }

    // POST - Create new user with Role
    if (request.method === 'POST') {
      const body = await request.json();
      const { username, password, role } = body;

      if (!username || !password) {
        return new Response(
          JSON.stringify({ success: false, error: 'Username and password are required' }),
          { status: 400, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } }
        );
      }

      const existingUser = await usersCollection.findOne({ username });
      if (existingUser) {
        return new Response(
          JSON.stringify({ success: false, error: 'User already exists' }),
          { status: 409, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } }
        );
      }

      const result = await usersCollection.insertOne({
        username,
        password,
        role: role || 'Desk', // Assigns chosen role or defaults to 'Desk'
        isAdmin: false,
        createdAt: new Date()
      });

      return new Response(
        JSON.stringify({
          success: true,
          id: result.insertedId.toString(),
          message: `User '${username}' created successfully`
        }),
        { status: 201, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } }
      );
    }

    // PUT - Update existing user (Role, Name, Password)
    if (request.method === 'PUT') {
      const body = await request.json();
      const { id, username, password, role } = body;

      if (!id) {
        return new Response(
          JSON.stringify({ success: false, error: 'User ID is required' }),
          { status: 400, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } }
        );
      }

      const updateData = {
        updatedAt: new Date()
      };
      if (username) updateData.username = username;
      if (password) updateData.password = password;
      if (role) updateData.role = role;

      const result = await usersCollection.updateOne(
        { _id: new ObjectId(id) },
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
          message: 'User updated successfully',
          modifiedCount: result.modifiedCount
        }),
        { status: 200, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } }
      );
    }

    // DELETE - Remove user and their entries
    if (request.method === 'DELETE') {
      const url = new URL(request.url);
      const username = url.searchParams.get('username');

      if (!username || username === 'admin') {
        return new Response(
          JSON.stringify({ success: false, error: 'Valid username required (cannot delete admin)' }),
          { status: 403, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } }
        );
      }

      const userResult = await usersCollection.deleteOne({ username });
      const entriesCollection = db.collection(entriesCollectionName);
      await entriesCollection.deleteMany({ userId: username });

      return new Response(
        JSON.stringify({ success: true, message: `User '${username}' deleted` }),
        { status: 200, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } }
      );
    }

    return new Response(
      JSON.stringify({ success: false, error: 'Method not allowed' }),
      { status: 405, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } }
    );
  } catch (error) {
    console.error('Manage users error:', error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 500, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } }
    );
  }
};