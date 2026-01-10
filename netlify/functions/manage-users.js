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
  // Handle CORS Preflight
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

    // GET: Fetch all users with their Zone and Role
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
            role: u.role || 'Desk', // Default legacy users to Desk
            userZone: u.userZone || null, // Stores '1', '2', '3A' etc for Zone role
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

    // POST: Create a new user (with default password logic)
    if (request.method === 'POST') {
      const body = await request.json();
      const { username, password, role, userZone } = body;

      if (!username) {
        return new Response(JSON.stringify({ success: false, error: 'Username is required' }), { status: 400 });
      }

      const existingUser = await usersCollection.findOne({ username });
      if (existingUser) {
        return new Response(JSON.stringify({ success: false, error: 'Username already exists' }), { status: 409 });
      }

      const result = await usersCollection.insertOne({
        username,
        password: password || 'olep@2026', // Apply default password if not provided
        role: role || 'Desk',
        userZone: userZone || null,
        isAdmin: false,
        createdAt: new Date()
      });

      return new Response(
        JSON.stringify({ success: true, id: result.insertedId.toString() }), 
        { status: 201, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } }
      );
    }

    // PUT: Update user profile (Change password, name, or role)
    if (request.method === 'PUT') {
      const body = await request.json();
      const { id, username, password, role, userZone } = body;

      if (!id) {
        return new Response(JSON.stringify({ success: false, error: 'User ID is required' }), { status: 400 });
      }

      const updateData = { updatedAt: new Date() };
      if (username) updateData.username = username;
      if (password) updateData.password = password;
      if (role) updateData.role = role;
      if (userZone !== undefined) updateData.userZone = userZone;

      const result = await usersCollection.updateOne(
        { _id: new ObjectId(id) },
        { $set: updateData }
      );

      if (result.matchedCount === 0) {
        return new Response(JSON.stringify({ success: false, error: 'User not found' }), { status: 404 });
      }

      return new Response(
        JSON.stringify({ success: true, message: 'User updated' }), 
        { status: 200, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } }
      );
    }

    // DELETE: Remove user and all their allocated band records
    if (request.method === 'DELETE') {
      const url = new URL(request.url);
      const username = url.searchParams.get('username');

      if (!username || username === 'admin') {
        return new Response(JSON.stringify({ success: false, error: 'Invalid username' }), { status: 400 });
      }

      // Delete the user
      await usersCollection.deleteOne({ username });
      
      // Delete all entries created by this user to keep database clean
      const entriesCollection = db.collection(entriesCollectionName);
      await entriesCollection.deleteMany({ userId: username });

      return new Response(
        JSON.stringify({ success: true, message: 'User and data deleted' }), 
        { status: 200, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } }
      );
    }

    return new Response(JSON.stringify({ success: false, error: 'Method not allowed' }), { status: 405 });

  } catch (error) {
    console.error('Manage users error:', error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }), 
      { status: 500, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } }
    );
  }
};