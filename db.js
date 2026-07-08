const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('ERROR: SUPABASE_URL and SUPABASE_KEY must be set in environment variables.');
}

const supabase = createClient(supabaseUrl, supabaseKey);

function slugifyUsername(name) {
  if (!name) return 'user_' + Math.floor(Math.random() * 10000);
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '');
}

async function generateUniqueSlug(table, name, column = 'slug') {
  if (!name) {
    name = table + '_' + Math.floor(Math.random() * 10000);
  }
  let baseSlug = name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '');

  if (!baseSlug) {
    baseSlug = table + '_' + Math.floor(Math.random() * 10000);
  }

  let slug = baseSlug;
  let counter = 1;
  let isUnique = false;

  while (!isUnique) {
    const { data, error } = await supabase
      .from(table)
      .select(column)
      .eq(column, slug)
      .maybeSingle();

    if (error) throw error;

    if (!data) {
      isUnique = true;
    } else {
      slug = `${baseSlug}_${counter}`;
      counter++;
    }
  }

  return slug;
}


async function getProducts() {
  const { data, error } = await supabase.from('products').select('*');
  if (error) throw error;
  return (data || []).map(p => ({
    ...p,
    category: p.category ? p.category.trim() : '',
    brandId: p.brand_id ? Number(p.brand_id) : null,
    price: Number(p.price),
    priceAourum: p.price_aourum ? Number(p.price_aourum) : null,
    slug: p.slug || null
  }));
}

async function addProduct(product) {
  let cleanCategory = '';
  if (product.category) {
    const trimmed = product.category.trim();
    try {
      const allProducts = await getProducts();
      const match = allProducts.find(p => p.category && p.category.trim().toLowerCase() === trimmed.toLowerCase());
      cleanCategory = match ? match.category.trim() : trimmed;
    } catch (err) {
      cleanCategory = trimmed;
    }
  }

  const slug = await generateUniqueSlug('products', product.name);
  const { data, error } = await supabase
    .from('products')
    .insert([{
      name: product.name,
      description: product.description || '',
      price: Number(product.price),
      price_aourum: product.priceAourum ? Number(product.priceAourum) : null,
      stock: (product.stock === null || product.stock === undefined || product.stock === '') ? null : Number(product.stock),
      category: cleanCategory,
      type: product.type || 'product',
      image: product.image || '',
      brand_id: product.brandId ? Number(product.brandId) : null,
      slug: slug
    }])
    .select()
    .single();

  if (error) throw error;
  return {
    ...data,
    brandId: data.brand_id ? Number(data.brand_id) : null,
    price: Number(data.price),
    priceAourum: data.price_aourum ? Number(data.price_aourum) : null,
    slug: data.slug || slug
  };
}

async function updateProduct(id, updatedProduct) {
  let cleanCategory = '';
  if (updatedProduct.category) {
    const trimmed = updatedProduct.category.trim();
    try {
      const allProducts = await getProducts();
      const match = allProducts.find(p => p.category && p.category.trim().toLowerCase() === trimmed.toLowerCase());
      cleanCategory = match ? match.category.trim() : trimmed;
    } catch (err) {
      cleanCategory = trimmed;
    }
  }

  const { data, error } = await supabase
    .from('products')
    .update({
      name: updatedProduct.name,
      description: updatedProduct.description || '',
      price: Number(updatedProduct.price),
      price_aourum: updatedProduct.priceAourum ? Number(updatedProduct.priceAourum) : null,
      stock: (updatedProduct.stock === null || updatedProduct.stock === undefined || updatedProduct.stock === '') ? null : Number(updatedProduct.stock),
      category: cleanCategory,
      type: updatedProduct.type || 'product',
      image: updatedProduct.image || '',
      brand_id: updatedProduct.brandId ? Number(updatedProduct.brandId) : null
    })
    .eq('id', Number(id))
    .select()
    .single();

  if (error) {
    if (error.code === 'PGRST116') return null;
    throw error;
  }
  return {
    ...data,
    brandId: data.brand_id ? Number(data.brand_id) : null,
    price: Number(data.price),
    priceAourum: data.price_aourum ? Number(data.price_aourum) : null
  };
}

async function deleteProduct(id) {
  const { data, error } = await supabase
    .from('products')
    .delete()
    .eq('id', Number(id))
    .select();

  if (error) throw error;
  return data && data.length > 0;
}

async function getFairs() {
  const { data, error } = await supabase
    .from('fairs')
    .select(`
      *,
      fair_brands (brand_id, status),
      fair_bands (band_id, status)
    `);
  if (error) throw error;
  return (data || []).map(f => {
    const acceptedBrands = [];
    const pendingBrands = [];
    const acceptedBands = [];
    const pendingBands = [];

    if (f.fair_brands) {
      f.fair_brands.forEach(fb => {
        const bId = Number(fb.brand_id);
        if (fb.status === 'accepted') {
          acceptedBrands.push(bId);
        } else {
          pendingBrands.push(bId);
        }
      });
    }

    if (f.fair_bands) {
      f.fair_bands.forEach(fb => {
        const bId = Number(fb.band_id);
        if (fb.status === 'accepted') {
          acceptedBands.push(bId);
        } else {
          pendingBands.push(bId);
        }
      });
    }

    return {
      id: Number(f.id),
      name: f.name,
      location: f.location,
      date: f.date,
      time: f.time,
      banner: f.banner,
      description: f.description,
      slug: f.slug,
      lat: f.lat ? Number(f.lat) : -16.39889,
      lng: f.lng ? Number(f.lng) : -71.53694,
      organizerId: f.organizer_id ? Number(f.organizer_id) : null,
      acceptedBrands,
      pendingBrands,
      acceptedBands,
      pendingBands
    };
  });
}

async function addFair(fair) {
  const slug = await generateUniqueSlug('fairs', fair.name);
  const { data, error } = await supabase
    .from('fairs')
    .insert([{
      name: fair.name,
      location: fair.location || '',
      date: fair.date || '',
      time: fair.time || '10:00 - 20:00',
      banner: fair.banner || '',
      description: fair.description || '',
      lat: fair.lat ? Number(fair.lat) : -16.39889,
      lng: fair.lng ? Number(fair.lng) : -71.53694,
      organizer_id: fair.organizerId ? Number(fair.organizerId) : null,
      slug: slug
    }])
    .select()
    .single();

  if (error) throw error;
  return {
    ...data,
    organizerId: data.organizer_id ? Number(data.organizer_id) : null,
    acceptedBrands: [],
    pendingBrands: [],
    acceptedBands: [],
    pendingBands: []
  };
}

async function getBands() {
  const { data, error } = await supabase
    .from('bands')
    .select(`
      *,
      person_bands (person_id, role)
    `);
  if (error) throw error;
  return (data || []).map(b => ({
    id: Number(b.id),
    name: b.name,
    genre: b.genre,
    members: Number(b.members),
    description: b.description,
    image: b.image,
    mediaLink: b.media_link,
    slug: b.slug,
    gigs: b.gigs || [],
    personIds: b.person_bands ? b.person_bands.map(pb => Number(pb.person_id)) : [],
    collaborators: b.person_bands ? b.person_bands.map(pb => ({ personId: Number(pb.person_id), role: pb.role || 'colaborador' })) : []
  }));
}

async function addBand(band) {
  const personId = band.personId ? Number(band.personId) : null;
  const slug = await generateUniqueSlug('bands', band.name);
  
  const { data, error } = await supabase
    .from('bands')
    .insert([{
      name: band.name,
      genre: band.genre || '',
      members: Number(band.members || 1),
      description: band.description || '',
      image: band.image || '',
      media_link: band.mediaLink || '',
      gigs: band.gigs || [],
      slug: slug
    }])
    .select()
    .single();

  if (error) throw error;

  if (personId) {
    const { error: juncError } = await supabase
      .from('person_bands')
      .insert([{ person_id: personId, band_id: Number(data.id), role: 'creador_original' }]);
    if (juncError) throw juncError;
  }

  return {
    id: Number(data.id),
    name: data.name,
    genre: data.genre,
    members: Number(data.members),
    description: data.description,
    image: data.image,
    mediaLink: data.media_link,
    slug: data.slug,
    gigs: data.gigs || [],
    personIds: personId ? [personId] : [],
    collaborators: personId ? [{ personId, role: 'creador_original' }] : []
  };
}

async function updateBand(id, updatedBand) {
  const updateFields = {
    name: updatedBand.name,
    genre: updatedBand.genre,
    members: updatedBand.members ? Number(updatedBand.members) : undefined,
    description: updatedBand.description,
    image: updatedBand.image,
    media_link: updatedBand.mediaLink,
    gigs: updatedBand.gigs
  };
  if (updatedBand.slug !== undefined) {
    updateFields.slug = updatedBand.slug;
  }
  const { data, error } = await supabase
    .from('bands')
    .update(updateFields)
    .eq('id', Number(id))
    .select()
    .single();

  if (error) {
    if (error.code === 'PGRST116') return null;
    throw error;
  }

  const { data: junctions } = await supabase
    .from('person_bands')
    .select('person_id, role')
    .eq('band_id', Number(id));

  return {
    id: Number(data.id),
    name: data.name,
    genre: data.genre,
    members: Number(data.members),
    description: data.description,
    image: data.image,
    mediaLink: data.media_link,
    slug: data.slug,
    gigs: data.gigs || [],
    personIds: junctions ? junctions.map(j => Number(j.person_id)) : [],
    collaborators: junctions ? junctions.map(j => ({ personId: Number(j.person_id), role: j.role || 'colaborador' })) : []
  };
}

async function getBrands() {
  const { data, error } = await supabase
    .from('brands')
    .select(`
      *,
      person_brands (person_id, role)
    `);
  if (error) throw error;
  return (data || []).map(b => ({
    id: Number(b.id),
    name: b.name,
    owner: b.owner,
    category: b.category,
    description: b.description,
    logo: b.logo,
    slug: b.slug,
    whatsappNumber: b.whatsapp_number || null,
    personIds: b.person_brands ? b.person_brands.map(pb => Number(pb.person_id)) : [],
    collaborators: b.person_brands ? b.person_brands.map(pb => ({ personId: Number(pb.person_id), role: pb.role || 'colaborador' })) : []
  }));
}

async function addBrand(brand) {
  const personId = brand.personId ? Number(brand.personId) : null;
  const slug = await generateUniqueSlug('brands', brand.name);

  const { data, error } = await supabase
    .from('brands')
    .insert([{
      name: brand.name,
      owner: brand.owner || '',
      category: brand.category || '',
      description: brand.description || '',
      logo: brand.logo || '',
      slug: slug,
      whatsapp_number: brand.whatsappNumber || null
    }])
    .select()
    .single();

  if (error) throw error;

  if (personId) {
    const { error: juncError } = await supabase
      .from('person_brands')
      .insert([{ person_id: personId, brand_id: Number(data.id), role: 'creador_original' }]);
    if (juncError) throw juncError;
  }

  return {
    id: Number(data.id),
    name: data.name,
    owner: data.owner,
    category: data.category,
    description: data.description,
    logo: data.logo,
    slug: data.slug,
    whatsappNumber: data.whatsapp_number || null,
    personIds: personId ? [personId] : [],
    collaborators: personId ? [{ personId, role: 'creador_original' }] : []
  };
}

async function updateBrand(id, updatedBrand) {
  const updateFields = {
    name: updatedBrand.name,
    owner: updatedBrand.owner,
    category: updatedBrand.category,
    description: updatedBrand.description,
    logo: updatedBrand.logo
  };
  if (updatedBrand.slug !== undefined) {
    updateFields.slug = updatedBrand.slug;
  }
  if (updatedBrand.whatsappNumber !== undefined) {
    updateFields.whatsapp_number = updatedBrand.whatsappNumber || null;
  }
  const { data, error } = await supabase
    .from('brands')
    .update(updateFields)
    .eq('id', Number(id))
    .select()
    .single();

  if (error) {
    if (error.code === 'PGRST116') return null;
    throw error;
  }

  const { data: junctions } = await supabase
    .from('person_brands')
    .select('person_id, role')
    .eq('brand_id', Number(id));

  return {
    id: Number(data.id),
    name: data.name,
    owner: data.owner,
    category: data.category,
    description: data.description,
    logo: data.logo,
    slug: data.slug,
    whatsappNumber: data.whatsapp_number || null,
    personIds: junctions ? junctions.map(j => Number(j.person_id)) : [],
    collaborators: junctions ? junctions.map(j => ({ personId: Number(j.person_id), role: j.role || 'colaborador' })) : []
  };
}

async function getOrganizers() {
  const { data, error } = await supabase
    .from('organizers')
    .select(`
      *,
      person_organizers (person_id, role)
    `);
  if (error) throw error;
  return (data || []).map(o => ({
    id: Number(o.id),
    name: o.name,
    owner: o.owner,
    description: o.description,
    logo: o.logo,
    slug: o.slug || '',
    personIds: o.person_organizers ? o.person_organizers.map(po => Number(po.person_id)) : [],
    collaborators: o.person_organizers ? o.person_organizers.map(po => ({ personId: Number(po.person_id), role: po.role || 'colaborador' })) : []
  }));
}

async function addOrganizer(organizer) {
  const personId = organizer.personId ? Number(organizer.personId) : null;
  const slug = await generateUniqueSlug('organizers', organizer.name);

  const { data, error } = await supabase
    .from('organizers')
    .insert([{
      name: organizer.name,
      owner: organizer.owner || '',
      description: organizer.description || '',
      logo: organizer.logo || '',
      slug: slug
    }])
    .select()
    .single();

  if (error) throw error;

  if (personId) {
    const { error: juncError } = await supabase
      .from('person_organizers')
      .insert([{ person_id: personId, organizer_id: Number(data.id), role: 'creador_original' }]);
    if (juncError) throw juncError;
  }

  return {
    id: Number(data.id),
    name: data.name,
    owner: data.owner,
    description: data.description,
    logo: data.logo,
    slug: data.slug || '',
    personIds: personId ? [personId] : [],
    collaborators: personId ? [{ personId, role: 'creador_original' }] : []
  };
}

async function updateOrganizer(id, updatedOrganizer) {
  const { data, error } = await supabase
    .from('organizers')
    .update({
      name: updatedOrganizer.name,
      owner: updatedOrganizer.owner,
      description: updatedOrganizer.description,
      logo: updatedOrganizer.logo,
      slug: updatedOrganizer.slug
    })
    .eq('id', Number(id))
    .select()
    .single();

  if (error) {
    if (error.code === 'PGRST116') return null;
    throw error;
  }

  const { data: junctions } = await supabase
    .from('person_organizers')
    .select('person_id, role')
    .eq('organizer_id', Number(id));

  return {
    id: Number(data.id),
    name: data.name,
    owner: data.owner,
    description: data.description,
    logo: data.logo,
    slug: data.slug || '',
    personIds: junctions ? junctions.map(j => Number(j.person_id)) : [],
    collaborators: junctions ? junctions.map(j => ({ personId: Number(j.person_id), role: j.role || 'colaborador' })) : []
  };
}

async function getPeople() {
  const { data, error } = await supabase
    .from('people')
    .select(`
      *,
      person_brands (brand_id, role),
      person_organizers (organizer_id, role),
      person_bands (band_id)
    `);
  if (error) throw error;
  return (data || []).map(p => ({
    id: Number(p.id),
    name: p.name,
    username: p.username,
    email: p.email,
    passwordHash: p.password_hash,
    hasPassword: !!p.password_hash,
    occupation: p.occupation,
    description: p.description,
    logo: p.logo,
    lastName: p.last_name || null,
    googleId: p.google_id || null,
    facebookId: p.facebook_id || null,
    brandIds: p.person_brands ? p.person_brands.map(b => Number(b.brand_id)) : [],
    brandRoles: p.person_brands ? p.person_brands.map(b => ({ brandId: Number(b.brand_id), role: b.role || 'colaborador' })) : [],
    organizerIds: p.person_organizers ? p.person_organizers.map(o => Number(o.organizer_id)) : [],
    organizerRoles: p.person_organizers ? p.person_organizers.map(o => ({ organizerId: Number(o.organizer_id), role: o.role || 'colaborador' })) : [],
    bandIds: p.person_bands ? p.person_bands.map(b => Number(b.band_id)) : []
  }));
}

async function addPerson(person) {
  const username = person.username || slugifyUsername(person.name);
  const { data, error } = await supabase
    .from('people')
    .insert([{
      name: person.name,
      username: username,
      email: person.email || null,
      password_hash: person.passwordHash || null,
      occupation: person.occupation || '',
      description: person.description || '',
      logo: person.logo || 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=150&h=150&fit=crop&q=80',
      last_name: person.lastName || null,
      google_id: person.googleId || null,
      facebook_id: person.facebookId || null
    }])
    .select()
    .single();

  if (error) throw error;

  const brandIds = person.brandIds ? person.brandIds.map(Number) : [];
  const organizerIds = person.organizerIds ? person.organizerIds.map(Number) : [];
  const bandIds = person.bandIds ? person.bandIds.map(Number) : [];

  if (brandIds.length > 0) {
    await supabase.from('person_brands').insert(brandIds.map(bId => ({ person_id: data.id, brand_id: bId, role: 'colaborador' })));
  }
  if (organizerIds.length > 0) {
    await supabase.from('person_organizers').insert(organizerIds.map(oId => ({ person_id: data.id, organizer_id: oId })));
  }
  if (bandIds.length > 0) {
    await supabase.from('person_bands').insert(bandIds.map(bId => ({ person_id: data.id, band_id: bId })));
  }

  return {
    id: Number(data.id),
    name: data.name,
    username: data.username,
    email: data.email,
    passwordHash: data.password_hash,
    hasPassword: !!data.password_hash,
    occupation: data.occupation,
    description: data.description,
    logo: data.logo,
    lastName: data.last_name || null,
    googleId: data.google_id || null,
    facebookId: data.facebook_id || null,
    brandIds,
    organizerIds,
    bandIds
  };
}

async function updatePerson(id, updatedPerson) {
  const personId = Number(id);
  const updateFields = {
    name: updatedPerson.name,
    email: updatedPerson.email,
    password_hash: updatedPerson.passwordHash,
    occupation: updatedPerson.occupation,
    description: updatedPerson.description,
    logo: updatedPerson.logo,
    last_name: updatedPerson.lastName !== undefined ? updatedPerson.lastName : null
  };

  if (updatedPerson.username !== undefined) {
    updateFields.username = updatedPerson.username || slugifyUsername(updatedPerson.name);
  }

  if (updatedPerson.googleId !== undefined) {
    updateFields.google_id = updatedPerson.googleId;
  }

  if (updatedPerson.facebookId !== undefined) {
    updateFields.facebook_id = updatedPerson.facebookId;
  }

  const { data, error } = await supabase
    .from('people')
    .update(updateFields)
    .eq('id', personId)
    .select()
    .single();

  if (error) {
    if (error.code === 'PGRST116') return null;
    throw error;
  }

  const brandIds = updatedPerson.brandIds ? updatedPerson.brandIds.map(Number) : [];
  const organizerIds = updatedPerson.organizerIds ? updatedPerson.organizerIds.map(Number) : [];
  const bandIds = updatedPerson.bandIds ? updatedPerson.bandIds.map(Number) : [];

  const { data: currentBrands } = await supabase
    .from('person_brands')
    .select('brand_id, role')
    .eq('person_id', personId);

  const brandRolesMap = {};
  if (currentBrands) {
    currentBrands.forEach(cb => {
      brandRolesMap[Number(cb.brand_id)] = cb.role;
    });
  }

  await supabase.from('person_brands').delete().eq('person_id', personId);
  if (brandIds.length > 0) {
    await supabase.from('person_brands').insert(brandIds.map(bId => ({
      person_id: personId,
      brand_id: bId,
      role: brandRolesMap[bId] || 'colaborador'
    })));
  }

  await supabase.from('person_organizers').delete().eq('person_id', personId);
  if (organizerIds.length > 0) {
    await supabase.from('person_organizers').insert(organizerIds.map(oId => ({ person_id: personId, organizer_id: oId })));
  }

  await supabase.from('person_bands').delete().eq('person_id', personId);
  if (bandIds.length > 0) {
    await supabase.from('person_bands').insert(bandIds.map(bId => ({
      person_id: personId,
      band_id: bId
    })));
  }

  return {
    id: personId,
    name: data.name,
    username: data.username,
    email: data.email,
    passwordHash: data.password_hash,
    hasPassword: !!data.password_hash,
    occupation: data.occupation,
    description: data.description,
    logo: data.logo,
    lastName: data.last_name || null,
    googleId: data.google_id || null,
    facebookId: data.facebook_id || null,
    brandIds,
    organizerIds,
    bandIds
  };
}

async function applyToFair(fairId, type, id) {
  const targetId = Number(id);
  const fId = Number(fairId);

  const { data: fairData, error: fairError } = await supabase
    .from('fairs')
    .select('id')
    .eq('id', fId)
    .single();

  if (fairError || !fairData) {
    return { error: 'Feria no encontrada' };
  }

  if (type === 'brand') {
    const { data: existing } = await supabase
      .from('fair_brands')
      .select('*')
      .eq('fair_id', fId)
      .eq('brand_id', targetId)
      .maybeSingle();

    if (!existing) {
      const { error: insertError } = await supabase
        .from('fair_brands')
        .insert([{ fair_id: fId, brand_id: targetId, status: 'pending' }]);
      if (insertError) throw insertError;
    }
  } else if (type === 'band') {
    const { data: existing } = await supabase
      .from('fair_bands')
      .select('*')
      .eq('fair_id', fId)
      .eq('band_id', targetId)
      .maybeSingle();

    if (!existing) {
      const { error: insertError } = await supabase
        .from('fair_bands')
        .insert([{ fair_id: fId, band_id: targetId, status: 'pending' }]);
      if (insertError) throw insertError;
    }
  } else {
    return { error: 'Tipo de aplicación no válido' };
  }

  const fairs = await getFairs();
  return fairs.find(f => f.id === fId);
}

async function getInvitations() {
  const { data, error } = await supabase.from('invitations').select('*');
  if (error) throw error;
  return (data || []).map(i => ({
    id: Number(i.id),
    senderType: i.sender_type,
    senderId: Number(i.sender_id),
    senderName: i.sender_name,
    receiverPersonId: Number(i.receiver_person_id),
    role: i.role,
    status: i.status,
    date: i.date
  }));
}

async function addInvitation(invitation) {
  const { data, error } = await supabase
    .from('invitations')
    .insert([{
      sender_type: invitation.senderType,
      sender_id: Number(invitation.senderId),
      sender_name: invitation.senderName,
      receiver_person_id: Number(invitation.receiverPersonId),
      role: invitation.role,
      status: 'pending',
      date: new Date().toISOString().split('T')[0]
    }])
    .select()
    .single();

  if (error) throw error;
  return {
    id: Number(data.id),
    senderType: data.sender_type,
    senderId: Number(data.sender_id),
    senderName: data.sender_name,
    receiverPersonId: Number(data.receiver_person_id),
    role: data.role,
    status: data.status,
    date: data.date
  };
}

async function respondToInvitation(id, status) {
  const invitationId = Number(id);

  const { data: invitation, error: fetchError } = await supabase
    .from('invitations')
    .select('*')
    .eq('id', invitationId)
    .single();

  if (fetchError || !invitation) {
    return { error: 'Invitación no encontrada' };
  }

  if (status === 'accepted') {
    const personId = Number(invitation.receiver_person_id);
    const senderId = Number(invitation.sender_id);

    if (invitation.sender_type === 'brand') {
      await supabase
        .from('person_brands')
        .insert([{ person_id: personId, brand_id: senderId, role: invitation.role || 'colaborador' }]);
    } else if (invitation.sender_type === 'organizer') {
      await supabase
        .from('person_organizers')
        .insert([{ person_id: personId, organizer_id: senderId }]);
    } else if (invitation.sender_type === 'band') {
      await supabase
        .from('person_bands')
        .insert([{ person_id: personId, band_id: senderId }]);
    }
  }

  await supabase
    .from('invitations')
    .delete()
    .eq('id', invitationId);

  return { success: true, status };
}

async function updateCollaboratorRole(entityType, entityId, personId, role) {
  let table = '';
  let idColumn = '';
  if (entityType === 'brand') {
    table = 'person_brands';
    idColumn = 'brand_id';
  } else if (entityType === 'band') {
    table = 'person_bands';
    idColumn = 'band_id';
  } else if (entityType === 'organizer') {
    table = 'person_organizers';
    idColumn = 'organizer_id';
  } else {
    throw new Error('Tipo de entidad no válido');
  }

  const { data, error } = await supabase
    .from(table)
    .update({ role })
    .eq(idColumn, Number(entityId))
    .eq('person_id', Number(personId))
    .select()
    .single();

  if (error) throw error;
  return data;
}

async function removeCollaborator(entityType, entityId, personId) {
  let table = '';
  let idColumn = '';
  if (entityType === 'brand') {
    table = 'person_brands';
    idColumn = 'brand_id';
  } else if (entityType === 'band') {
    table = 'person_bands';
    idColumn = 'band_id';
  } else if (entityType === 'organizer') {
    table = 'person_organizers';
    idColumn = 'organizer_id';
  } else {
    throw new Error('Tipo de entidad no válido');
  }

  const { data, error } = await supabase
    .from(table)
    .delete()
    .eq(idColumn, Number(entityId))
    .eq('person_id', Number(personId))
    .select();

  if (error) throw error;
  return data && data.length > 0;
}

async function updateFair(id, updatedFair) {
  const updateFields = {
    name: updatedFair.name,
    location: updatedFair.location,
    date: updatedFair.date,
    time: updatedFair.time,
    banner: updatedFair.banner,
    description: updatedFair.description,
    lat: updatedFair.lat ? Number(updatedFair.lat) : undefined,
    lng: updatedFair.lng ? Number(updatedFair.lng) : undefined,
    organizer_id: updatedFair.organizerId ? Number(updatedFair.organizerId) : undefined
  };
  if (updatedFair.slug !== undefined) {
    updateFields.slug = updatedFair.slug;
  }
  const { data, error } = await supabase
    .from('fairs')
    .update(updateFields)
    .eq('id', Number(id))
    .select()
    .single();

  if (error) {
    if (error.code === 'PGRST116') return null;
    throw error;
  }
  
  const fairs = await getFairs();
  return fairs.find(f => f.id === Number(id));
}

async function deleteFair(id) {
  const fId = Number(id);
  await supabase.from('fair_brands').delete().eq('fair_id', fId);
  await supabase.from('fair_bands').delete().eq('fair_id', fId);
  const { data, error } = await supabase
    .from('fairs')
    .delete()
    .eq('id', fId)
    .select();
  if (error) throw error;
  return data && data.length > 0;
}

async function respondToFairApplication(fairId, type, entityId, accept) {
  const fId = Number(fairId);
  const entId = Number(entityId);
  
  if (type === 'brand') {
    if (accept) {
      const { error } = await supabase
        .from('fair_brands')
        .update({ status: 'accepted' })
        .eq('fair_id', fId)
        .eq('brand_id', entId);
      if (error) throw error;
    } else {
      const { error } = await supabase
        .from('fair_brands')
        .delete()
        .eq('fair_id', fId)
        .eq('brand_id', entId);
      if (error) throw error;
    }
  } else if (type === 'band') {
    if (accept) {
      const { error } = await supabase
        .from('fair_bands')
        .update({ status: 'accepted' })
        .eq('fair_id', fId)
        .eq('band_id', entId);
      if (error) throw error;
    } else {
      const { error } = await supabase
        .from('fair_bands')
        .delete()
        .eq('fair_id', fId)
        .eq('band_id', entId);
      if (error) throw error;
    }
  }
  
  return { success: true };
}

async function deleteBand(id) {
  const bId = Number(id);
  await supabase.from('person_bands').delete().eq('band_id', bId);
  await supabase.from('fair_bands').delete().eq('band_id', bId);
  await supabase.from('invitations').delete().eq('sender_id', bId).eq('sender_type', 'band');
  const { data, error } = await supabase.from('bands').delete().eq('id', bId).select();
  if (error) throw error;
  return data && data.length > 0;
}

async function deleteBrand(id) {
  const bId = Number(id);
  await supabase.from('products').delete().eq('brand_id', bId);
  await supabase.from('person_brands').delete().eq('brand_id', bId);
  await supabase.from('fair_brands').delete().eq('brand_id', bId);
  await supabase.from('invitations').delete().eq('sender_id', bId).eq('sender_type', 'brand');
  const { data, error } = await supabase.from('brands').delete().eq('id', bId).select();
  if (error) throw error;
  return data && data.length > 0;
}

async function deleteOrganizer(id) {
  const oId = Number(id);
  const { data: fairsData, error: fairsFetchError } = await supabase
    .from('fairs')
    .select('id')
    .eq('organizer_id', oId);
  
  if (fairsFetchError) throw fairsFetchError;
  
  if (fairsData && fairsData.length > 0) {
    const fairIds = fairsData.map(f => f.id);
    await supabase.from('fair_brands').delete().in('fair_id', fairIds);
    await supabase.from('fair_bands').delete().in('fair_id', fairIds);
    await supabase.from('fairs').delete().in('id', fairIds);
  }
  
  await supabase.from('person_organizers').delete().eq('organizer_id', oId);
  await supabase.from('invitations').delete().eq('sender_id', oId).eq('sender_type', 'organizer');
  const { data, error } = await supabase.from('organizers').delete().eq('id', oId).select();
  if (error) throw error;
  return data && data.length > 0;
}

async function isSlugUnique(table, slug, excludeId = null) {
  if (!slug) return true;
  let query = supabase
    .from(table)
    .select('id')
    .eq('slug', slug);
  if (excludeId) {
    query = query.neq('id', Number(excludeId));
  }
  const { data, error } = await query.maybeSingle();
  if (error) throw error;
  return !data;
}

async function deletePerson(id) {
  const personId = Number(id);

  // 1. Obtener todas las bandas, marcas y organizaciones para identificar la propiedad
  const bands = await getBands();
  const brands = await getBrands();
  const organizers = await getOrganizers();

  // Buscar entidades donde el usuario sea el creador original
  const bandsToDelete = bands.filter(b => 
    b.collaborators.some(c => c.personId === personId && c.role === 'creador_original')
  );

  const brandsToDelete = brands.filter(b => 
    b.collaborators.some(c => c.personId === personId && c.role === 'creador_original')
  );

  const organizersToDelete = organizers.filter(o => 
    o.collaborators.some(c => c.personId === personId && c.role === 'creador_original')
  );

  // 2. Eliminar en cascada las entidades que el usuario creó
  for (const band of bandsToDelete) {
    await deleteBand(band.id);
  }
  for (const brand of brandsToDelete) {
    await deleteBrand(brand.id);
  }
  for (const org of organizersToDelete) {
    await deleteOrganizer(org.id);
  }

  // 3. Eliminar relaciones restantes de colaborador simple
  await supabase.from('person_bands').delete().eq('person_id', personId);
  await supabase.from('person_brands').delete().eq('person_id', personId);
  await supabase.from('person_organizers').delete().eq('person_id', personId);

  // 4. Eliminar invitaciones recibidas
  await supabase.from('invitations').delete().eq('receiver_person_id', personId);

  // 5. Eliminar el registro del usuario de la tabla 'people'
  const { data, error } = await supabase.from('people').delete().eq('id', personId).select();
  if (error) throw error;

  return data && data.length > 0;
}

module.exports = {
  getProducts,
  addProduct,
  updateProduct,
  deleteProduct,
  getFairs,
  addFair,
  updateFair,
  deleteFair,
  respondToFairApplication,
  getBands,
  addBand,
  updateBand,
  deleteBand,
  getBrands,
  addBrand,
  updateBrand,
  deleteBrand,
  getOrganizers,
  addOrganizer,
  updateOrganizer,
  deleteOrganizer,
  getPeople,
  addPerson,
  updatePerson,
  deletePerson,
  applyToFair,
  getInvitations,
  addInvitation,
  respondToInvitation,
  updateCollaboratorRole,
  removeCollaborator,
  isSlugUnique
};

