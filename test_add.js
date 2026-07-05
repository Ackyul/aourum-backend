const db = require('./db');

async function test() {
  try {
    console.log('Attempting to add organizer...');
    const result = await db.addOrganizer({
      name: 'Test',
      owner: 'Yoshua',
      description: 'Ferias',
      logo: 'https://images.unsplash.com/photo-1533174072545-7a4b6ad7a6c3?w=150&h=150&fit=crop&q=80',
      personId: 1
    });
    console.log('Result of addOrganizer:', result);
  } catch (err) {
    console.error('Error during addOrganizer:', err);
  }
}

test();
