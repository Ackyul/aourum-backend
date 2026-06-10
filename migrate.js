const fs = require('fs');
const path = require('path');

const dbPath = path.join(__dirname, 'data', 'db.json');

if (!fs.existsSync(dbPath)) {
  console.error('El archivo db.json no existe. Asegúrate de iniciar la app o crear el archivo.');
  process.exit(1);
}

try {
  const rawData = fs.readFileSync(dbPath, 'utf8');
  const db = JSON.parse(rawData);

  console.log('--- Iniciando migración de base de datos de AOURUM ---');

  // 1. Crear colección organizers (organizadores)
  db.organizers = [
    {
      id: 1,
      name: "Eventos Rebel",
      owner: "Carlos Rebel",
      description: "Productora boutique líder en festivales alternativos, mercadillos de arte y ferias de diseño independiente en Arequipa.",
      logo: "https://images.unsplash.com/photo-1533174072545-7a4b6ad7a6c3?w=150&h=150&fit=crop&q=80"
    }
  ];
  console.log('✓ Colección "organizers" creada.');

  // 2. Renombrar stallholders a brands
  if (db.stallholders) {
    db.brands = db.stallholders.map(s => ({
      id: s.id,
      name: s.name,
      owner: s.owner,
      category: s.category,
      description: s.description,
      logo: s.logo || 'https://images.unsplash.com/photo-1605100804763-247f67b3557e?w=150&h=150&fit=crop&q=80'
    }));
    delete db.stallholders;
    console.log(`✓ Colección "stallholders" migrada a "brands" (${db.brands.length} marcas creadas).`);
  } else {
    db.brands = db.brands || [];
    console.log('✓ La colección "brands" ya existe o no requiere cambios.');
  }

  // 3. Renombrar stallholderId a brandId en products
  if (db.products) {
    let count = 0;
    db.products = db.products.map(p => {
      if ('stallholderId' in p) {
        p.brandId = p.stallholderId;
        delete p.stallholderId;
        count++;
      }
      return p;
    });
    console.log(`✓ Campo "stallholderId" renombrado a "brandId" en ${count} productos.`);
  }

  // 4. Actualizar fairs con organizerId y renombrar arrays de postulaciones
  if (db.fairs) {
    let count = 0;
    db.fairs = db.fairs.map(f => {
      // Asignar organizador 1 por defecto si no tiene
      if (!f.organizerId) {
        f.organizerId = 1;
      }
      
      // Renombrar arrays de postulantes
      if ('acceptedStallholders' in f) {
        f.acceptedBrands = f.acceptedStallholders;
        delete f.acceptedStallholders;
      } else {
        f.acceptedBrands = f.acceptedBrands || [];
      }

      if ('pendingStallholders' in f) {
        f.pendingBrands = f.pendingStallholders;
        delete f.pendingStallholders;
      } else {
        f.pendingBrands = f.pendingBrands || [];
      }
      
      count++;
      return f;
    });
    console.log(`✓ Fiestas/Ferias actualizadas con "organizerId: 1" y postulaciones renombradas (${count} ferias).`);
  }

  // Guardar datos migrados
  fs.writeFileSync(dbPath, JSON.stringify(db, null, 2), 'utf8');
  console.log('=== ¡Migración completada exitosamente! ===');
} catch (error) {
  console.error('Error durante la migración:', error);
  process.exit(1);
}
