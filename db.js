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


async function getProducts(options = {}) {
  let query = supabase.from('products').select('*', { count: options.paginated ? 'exact' : undefined });

  if (options.category && options.category !== 'all') {
    query = query.eq('category', options.category);
  }
  if (options.brandId) {
    query = query.eq('brand_id', Number(options.brandId));
  }
  if (options.search) {
    query = query.ilike('name', `%${options.search}%`);
  }

  query = query.order('id', { ascending: false });

  if (options.page && options.limit) {
    const page = Number(options.page);
    const limit = Number(options.limit);
    const from = (page - 1) * limit;
    const to = from + limit - 1;
    query = query.range(from, to);
  } else if (options.limit) {
    query = query.limit(Number(options.limit));
  }

  const { data, error, count } = await query;
  if (error) throw error;

  const items = (data || []).map(p => ({
    ...p,
    category: p.category ? p.category.trim() : '',
    brandId: p.brand_id ? Number(p.brand_id) : null,
    price: Number(p.price),
    priceAourum: p.price_aourum ? Number(p.price_aourum) : null,
    slug: p.slug || null
  }));

  if (options.paginated) {
    return {
      items,
      count: count || items.length,
      page: options.page ? Number(options.page) : 1,
      limit: options.limit ? Number(options.limit) : items.length
    };
  }
  return items;
}

async function addProduct(product) {
  let cleanCategory = '';
  if (product.category) {
    const trimmed = product.category.trim();
    try {
      const { data: matches, error } = await supabase
        .from('products')
        .select('category')
        .ilike('category', trimmed)
        .limit(1);
      if (!error && matches && matches.length > 0) {
        cleanCategory = matches[0].category.trim();
      } else {
        cleanCategory = trimmed;
      }
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
      const { data: matches, error } = await supabase
        .from('products')
        .select('category')
        .ilike('category', trimmed)
        .limit(1);
      if (!error && matches && matches.length > 0) {
        cleanCategory = matches[0].category.trim();
      } else {
        cleanCategory = trimmed;
      }
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

async function getFairs(options = {}) {
  let query = supabase.from('fairs').select(`
    *,
    fair_brands (brand_id, status),
    fair_bands (band_id, status)
  `, { count: options.paginated ? 'exact' : undefined });

  if (options.search) {
    query = query.ilike('name', `%${options.search}%`);
  }

  query = query.order('id', { ascending: false });

  if (options.page && options.limit) {
    const page = Number(options.page);
    const limit = Number(options.limit);
    const from = (page - 1) * limit;
    const to = from + limit - 1;
    query = query.range(from, to);
  } else if (options.limit) {
    query = query.limit(Number(options.limit));
  }

  const { data, error, count } = await query;
  if (error) throw error;

  const items = (data || []).map(f => {
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

  if (options.paginated) {
    return {
      items,
      count: count || items.length,
      page: options.page ? Number(options.page) : 1,
      limit: options.limit ? Number(options.limit) : items.length
    };
  }
  return items;
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

async function getBrands(options = {}) {
  let query = supabase.from('brands').select(`
    *,
    person_brands (person_id, role)
  `, { count: options.paginated ? 'exact' : undefined });

  if (options.category && options.category !== 'all') {
    query = query.eq('category', options.category);
  }
  if (options.search) {
    query = query.ilike('name', `%${options.search}%`);
  }

  query = query.order('id', { ascending: false });

  if (options.page && options.limit) {
    const page = Number(options.page);
    const limit = Number(options.limit);
    const from = (page - 1) * limit;
    const to = from + limit - 1;
    query = query.range(from, to);
  } else if (options.limit) {
    query = query.limit(Number(options.limit));
  }

  const { data, error, count } = await query;
  if (error) throw error;

  const items = (data || []).map(b => ({
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

  if (options.paginated) {
    return {
      items,
      count: count || items.length,
      page: options.page ? Number(options.page) : 1,
      limit: options.limit ? Number(options.limit) : items.length
    };
  }
  return items;
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

async function getPeople(options = {}) {
  let query = supabase.from('people').select(`
    *,
    person_brands (brand_id, role),
    person_organizers (organizer_id, role),
    person_bands (band_id)
  `, { count: options.paginated ? 'exact' : undefined });

  if (options.search) {
    query = query.or(`name.ilike.%${options.search}%,username.ilike.%${options.search}%`);
  }

  query = query.order('id', { ascending: false });

  if (options.page && options.limit) {
    const page = Number(options.page);
    const limit = Number(options.limit);
    const from = (page - 1) * limit;
    const to = from + limit - 1;
    query = query.range(from, to);
  } else if (options.limit) {
    query = query.limit(Number(options.limit));
  }

  const { data, error, count } = await query;
  if (error) throw error;

  const items = (data || []).map(p => ({
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

  if (options.paginated) {
    return {
      items,
      count: count || items.length,
      page: options.page ? Number(options.page) : 1,
      limit: options.limit ? Number(options.limit) : items.length
    };
  }
  return items;
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
    .select('id, description')
    .eq('id', fId)
    .single();

  if (fairError || !fairData) {
    return { error: 'Feria no encontrada' };
  }

  let allowed = true;
  if (fairData.description) {
    try {
      const parsed = JSON.parse(fairData.description);
      const fairType = parsed.fair_type || "both";
      if (type === 'brand' && fairType === 'only_bands') {
        allowed = false;
      }
      if (type === 'band' && fairType === 'only_brands') {
        allowed = false;
      }
    } catch (e) {
      // Ignore if description is not a valid JSON string
    }
  }

  if (!allowed) {
    return { error: `Este evento no acepta postulaciones de tipo ${type === 'brand' ? 'marcas' : 'bandas'}.` };
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
    return { error: 'Tipo de aplicaciÃ³n no vÃ¡lido' };
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
    return { error: 'InvitaciÃ³n no encontrada' };
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
    throw new Error('Tipo de entidad no vÃ¡lido');
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
    throw new Error('Tipo de entidad no vÃ¡lido');
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

  // 1. Obtener relaciones donde el usuario sea el creador original
  const { data: juncBands, error: bErr } = await supabase.from('person_bands').select('band_id').eq('person_id', personId).eq('role', 'creador_original');
  if (bErr) throw bErr;
  const { data: juncBrands, error: brErr } = await supabase.from('person_brands').select('brand_id').eq('person_id', personId).eq('role', 'creador_original');
  if (brErr) throw brErr;
  const { data: juncOrgs, error: oErr } = await supabase.from('person_organizers').select('organizer_id').eq('person_id', personId).eq('role', 'creador_original');
  if (oErr) throw oErr;

  const bandsToDelete = juncBands ? juncBands.map(b => Number(b.band_id)) : [];
  const brandsToDelete = juncBrands ? juncBrands.map(b => Number(b.brand_id)) : [];
  const organizersToDelete = juncOrgs ? juncOrgs.map(o => Number(o.organizer_id)) : [];

  // 2. Eliminar en cascada las entidades que el usuario creÃ³
  for (const bandId of bandsToDelete) {
    await deleteBand(bandId);
  }
  for (const brandId of brandsToDelete) {
    await deleteBrand(brandId);
  }
  for (const orgId of organizersToDelete) {
    await deleteOrganizer(orgId);
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

// â”€â”€ CONSULTAS OPTIMIZADAS DIRECTAS (O(1)) â”€â”€

async function getProductById(id) {
  const { data, error } = await supabase
    .from('products')
    .select('*')
    .eq('id', Number(id))
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;
  return {
    ...data,
    brandId: data.brand_id ? Number(data.brand_id) : null,
    price: Number(data.price),
    priceAourum: data.price_aourum ? Number(data.price_aourum) : null,
    slug: data.slug || null
  };
}

async function getProductBySlug(slug) {
  if (!slug) return null;
  const { data, error } = await supabase
    .from('products')
    .select('*')
    .eq('slug', slug)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;
  return {
    ...data,
    brandId: data.brand_id ? Number(data.brand_id) : null,
    price: Number(data.price),
    priceAourum: data.price_aourum ? Number(data.price_aourum) : null,
    slug: data.slug || null
  };
}

async function getPersonById(id) {
  const { data, error } = await supabase
    .from('people')
    .select(`
      *,
      person_brands (brand_id, role),
      person_organizers (organizer_id, role),
      person_bands (band_id)
    `)
    .eq('id', Number(id))
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;
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
    brandIds: data.person_brands ? data.person_brands.map(b => Number(b.brand_id)) : [],
    brandRoles: data.person_brands ? data.person_brands.map(b => ({ brandId: Number(b.brand_id), role: b.role || 'colaborador' })) : [],
    organizerIds: data.person_organizers ? data.person_organizers.map(o => Number(o.organizer_id)) : [],
    organizerRoles: data.person_organizers ? data.person_organizers.map(o => ({ organizerId: Number(o.organizer_id), role: o.role || 'colaborador' })) : [],
    bandIds: data.person_bands ? data.person_bands.map(b => Number(b.band_id)) : []
  };
}

async function getPersonByEmail(email) {
  if (!email) return null;
  const emailLower = email.toLowerCase().trim();
  const { data, error } = await supabase
    .from('people')
    .select(`
      *,
      person_brands (brand_id, role),
      person_organizers (organizer_id, role),
      person_bands (band_id)
    `)
    .eq('email', emailLower)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;
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
    brandIds: data.person_brands ? data.person_brands.map(b => Number(b.brand_id)) : [],
    brandRoles: data.person_brands ? data.person_brands.map(b => ({ brandId: Number(b.brand_id), role: b.role || 'colaborador' })) : [],
    organizerIds: data.person_organizers ? data.person_organizers.map(o => Number(o.organizer_id)) : [],
    organizerRoles: data.person_organizers ? data.person_organizers.map(o => ({ organizerId: Number(o.organizer_id), role: o.role || 'colaborador' })) : [],
    bandIds: data.person_bands ? data.person_bands.map(b => Number(b.band_id)) : []
  };
}

async function getPersonByUsername(username) {
  if (!username) return null;
  const cleanUsername = username.toLowerCase().trim();
  const { data, error } = await supabase
    .from('people')
    .select(`
      *,
      person_brands (brand_id, role),
      person_organizers (organizer_id, role),
      person_bands (band_id)
    `)
    .eq('username', cleanUsername)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;
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
    brandIds: data.person_brands ? data.person_brands.map(b => Number(b.brand_id)) : [],
    brandRoles: data.person_brands ? data.person_brands.map(b => ({ brandId: Number(b.brand_id), role: b.role || 'colaborador' })) : [],
    organizerIds: data.person_organizers ? data.person_organizers.map(o => Number(o.organizer_id)) : [],
    organizerRoles: data.person_organizers ? data.person_organizers.map(o => ({ organizerId: Number(o.organizer_id), role: o.role || 'colaborador' })) : [],
    bandIds: data.person_bands ? data.person_bands.map(b => Number(b.band_id)) : []
  };
}

async function getPersonByGoogleId(googleId) {
  if (!googleId) return null;
  const { data, error } = await supabase
    .from('people')
    .select(`
      *,
      person_brands (brand_id, role),
      person_organizers (organizer_id, role),
      person_bands (band_id)
    `)
    .eq('google_id', googleId)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;
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
    brandIds: data.person_brands ? data.person_brands.map(b => Number(b.brand_id)) : [],
    brandRoles: data.person_brands ? data.person_brands.map(b => ({ brandId: Number(b.brand_id), role: b.role || 'colaborador' })) : [],
    organizerIds: data.person_organizers ? data.person_organizers.map(o => Number(o.organizer_id)) : [],
    organizerRoles: data.person_organizers ? data.person_organizers.map(o => ({ organizerId: Number(o.organizer_id), role: o.role || 'colaborador' })) : [],
    bandIds: data.person_bands ? data.person_bands.map(b => Number(b.band_id)) : []
  };
}

async function getPersonByFacebookId(facebookId) {
  if (!facebookId) return null;
  const { data, error } = await supabase
    .from('people')
    .select(`
      *,
      person_brands (brand_id, role),
      person_organizers (organizer_id, role),
      person_bands (band_id)
    `)
    .eq('facebook_id', facebookId)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;
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
    brandIds: data.person_brands ? data.person_brands.map(b => Number(b.brand_id)) : [],
    brandRoles: data.person_brands ? data.person_brands.map(b => ({ brandId: Number(b.brand_id), role: b.role || 'colaborador' })) : [],
    organizerIds: data.person_organizers ? data.person_organizers.map(o => Number(o.organizer_id)) : [],
    organizerRoles: data.person_organizers ? data.person_organizers.map(o => ({ organizerId: Number(o.organizer_id), role: o.role || 'colaborador' })) : [],
    bandIds: data.person_bands ? data.person_bands.map(b => Number(b.band_id)) : []
  };
}

async function getBrandById(id) {
  const { data, error } = await supabase
    .from('brands')
    .select(`
      *,
      person_brands (person_id, role)
    `)
    .eq('id', Number(id))
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;
  return {
    id: Number(data.id),
    name: data.name,
    owner: data.owner,
    category: data.category,
    description: data.description,
    logo: data.logo,
    slug: data.slug,
    whatsappNumber: data.whatsapp_number || null,
    personIds: data.person_brands ? data.person_brands.map(pb => Number(pb.person_id)) : [],
    collaborators: data.person_brands ? data.person_brands.map(pb => ({ personId: Number(pb.person_id), role: pb.role || 'colaborador' })) : []
  };
}

async function getBandById(id) {
  const { data, error } = await supabase
    .from('bands')
    .select(`
      *,
      person_bands (person_id, role)
    `)
    .eq('id', Number(id))
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;
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
    personIds: data.person_bands ? data.person_bands.map(pb => Number(pb.person_id)) : [],
    collaborators: data.person_bands ? data.person_bands.map(pb => ({ personId: Number(pb.person_id), role: pb.role || 'colaborador' })) : []
  };
}

async function getOrganizerById(id) {
  const { data, error } = await supabase
    .from('organizers')
    .select(`
      *,
      person_organizers (person_id, role)
    `)
    .eq('id', Number(id))
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;
  return {
    id: Number(data.id),
    name: data.name,
    owner: data.owner,
    description: data.description,
    logo: data.logo,
    slug: data.slug || '',
    personIds: data.person_organizers ? data.person_organizers.map(po => Number(po.person_id)) : [],
    collaborators: data.person_organizers ? data.person_organizers.map(po => ({ personId: Number(po.person_id), role: po.role || 'colaborador' })) : []
  };
}

async function getFairById(id) {
  const { data, error } = await supabase
    .from('fairs')
    .select(`
      *,
      fair_brands (brand_id, status),
      fair_bands (band_id, status)
    `)
    .eq('id', Number(id))
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;

  const acceptedBrands = [];
  const pendingBrands = [];
  const acceptedBands = [];
  const pendingBands = [];

  if (data.fair_brands) {
    data.fair_brands.forEach(fb => {
      const bId = Number(fb.brand_id);
      if (fb.status === 'accepted') {
        acceptedBrands.push(bId);
      } else {
        pendingBrands.push(bId);
      }
    });
  }

  if (data.fair_bands) {
    data.fair_bands.forEach(fb => {
      const bId = Number(fb.band_id);
      if (fb.status === 'accepted') {
        acceptedBands.push(bId);
      } else {
        pendingBands.push(bId);
      }
    });
  }

  return {
    id: Number(data.id),
    name: data.name,
    location: data.location,
    date: data.date,
    time: data.time,
    banner: data.banner,
    description: data.description,
    slug: data.slug,
    lat: data.lat ? Number(data.lat) : -16.39889,
    lng: data.lng ? Number(data.lng) : -71.53694,
    organizerId: data.organizer_id ? Number(data.organizer_id) : null,
    acceptedBrands,
    pendingBrands,
    acceptedBands,
    pendingBands
  };
}

async function isCollaborator(personId, entityType, entityId) {
  let table = '';
  let idCol = '';
  if (entityType === 'brand') {
    table = 'person_brands';
    idCol = 'brand_id';
  } else if (entityType === 'band') {
    table = 'person_bands';
    idCol = 'band_id';
  } else if (entityType === 'organizer') {
    table = 'person_organizers';
    idCol = 'organizer_id';
  } else {
    return false;
  }
  const { data, error } = await supabase
    .from(table)
    .select('person_id')
    .eq('person_id', Number(personId))
    .eq(idCol, Number(entityId))
    .maybeSingle();

  if (error) return false;
  return !!data;
}

async function isCreatorOriginal(personId, entityType, entityId) {
  let table = '';
  let idCol = '';
  if (entityType === 'brand') {
    table = 'person_brands';
    idCol = 'brand_id';
  } else if (entityType === 'band') {
    table = 'person_bands';
    idCol = 'band_id';
  } else if (entityType === 'organizer') {
    table = 'person_organizers';
    idCol = 'organizer_id';
  } else {
    return false;
  }
  const { data, error } = await supabase
    .from(table)
    .select('person_id')
    .eq('person_id', Number(personId))
    .eq(idCol, Number(entityId))
    .eq('role', 'creador_original')
    .maybeSingle();

  if (error) return false;
  return !!data;
}

async function getBrandBySlug(slug) {
  const isId = !isNaN(slug);
  let query = supabase.from('brands').select(`
    *,
    person_brands (person_id, role)
  `);
  if (isId) {
    query = query.eq('id', Number(slug));
  } else {
    const altSlug = slug.includes('_') ? slug.replace(/_/g, '-') : slug.replace(/-/g, '_');
    query = query.or(`slug.eq.${slug},slug.eq.${altSlug}`);
  }
  const { data, error } = await query.maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return {
    id: Number(data.id),
    name: data.name,
    owner: data.owner,
    category: data.category,
    description: data.description,
    logo: data.logo,
    slug: data.slug,
    whatsappNumber: data.whatsapp_number || null,
    personIds: data.person_brands ? data.person_brands.map(pb => Number(pb.person_id)) : [],
    collaborators: data.person_brands ? data.person_brands.map(pb => ({ personId: Number(pb.person_id), role: pb.role || 'colaborador' })) : []
  };
}

async function getBandBySlug(slug) {
  const isId = !isNaN(slug);
  let query = supabase.from('bands').select('*');
  if (isId) {
    query = query.eq('id', Number(slug));
  } else {
    const altSlug = slug.includes('_') ? slug.replace(/_/g, '-') : slug.replace(/-/g, '_');
    query = query.or(`slug.eq.${slug},slug.eq.${altSlug}`);
  }
  const { data, error } = await query.maybeSingle();
  if (error) throw error;
  if (!data) return null;

  const { data: junctions } = await supabase
    .from('person_bands')
    .select('person_id, role')
    .eq('band_id', Number(data.id));

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

async function getFairBySlug(slug) {
  const isId = !isNaN(slug);
  let query = supabase.from('fairs').select(`
    *,
    fair_brands (brand_id, status),
    fair_bands (band_id, status)
  `);
  if (isId) {
    query = query.eq('id', Number(slug));
  } else {
    const altSlug = slug.includes('_') ? slug.replace(/_/g, '-') : slug.replace(/-/g, '_');
    query = query.or(`slug.eq.${slug},slug.eq.${altSlug}`);
  }
  const { data, error } = await query.maybeSingle();
  if (error) throw error;
  if (!data) return null;

  const acceptedBrands = [];
  const pendingBrands = [];
  const acceptedBands = [];
  const pendingBands = [];

  if (data.fair_brands) {
    data.fair_brands.forEach(fb => {
      const bId = Number(fb.brand_id);
      if (fb.status === 'accepted') {
        acceptedBrands.push(bId);
      } else {
        pendingBrands.push(bId);
      }
    });
  }

  if (data.fair_bands) {
    data.fair_bands.forEach(fb => {
      const bId = Number(fb.band_id);
      if (fb.status === 'accepted') {
        acceptedBands.push(bId);
      } else {
        pendingBands.push(bId);
      }
    });
  }

  return {
    id: Number(data.id),
    name: data.name,
    location: data.location,
    date: data.date,
    time: data.time,
    banner: data.banner,
    description: data.description,
    slug: data.slug,
    lat: data.lat ? Number(data.lat) : -16.39889,
    lng: data.lng ? Number(data.lng) : -71.53694,
    organizerId: data.organizer_id ? Number(data.organizer_id) : null,
    acceptedBrands,
    pendingBrands,
    acceptedBands,
    pendingBands
  };
}

async function getOrganizerBySlug(slug) {
  const isId = !isNaN(slug);
  let query = supabase.from('organizers').select('*');
  if (isId) {
    query = query.eq('id', Number(slug));
  } else {
    query = query.eq('slug', slug);
  }
  const { data, error } = await query.maybeSingle();
  if (error) throw error;
  if (!data) return null;

  const { data: junctions } = await supabase
    .from('person_organizers')
    .select('person_id, role')
    .eq('organizer_id', Number(data.id));

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

module.exports = {
  getProducts,
  getProductById,
  getProductBySlug,
  getBrandBySlug,
  getBandBySlug,
  getFairBySlug,
  getOrganizerBySlug,
  addProduct,
  updateProduct,
  deleteProduct,
  getFairs,
  getFairById,
  addFair,
  updateFair,
  deleteFair,
  respondToFairApplication,
  getBands,
  getBandById,
  addBand,
  updateBand,
  deleteBand,
  getBrands,
  getBrandById,
  addBrand,
  updateBrand,
  deleteBrand,
  getOrganizers,
  getOrganizerById,
  addOrganizer,
  updateOrganizer,
  deleteOrganizer,
  getPeople,
  getPersonById,
  getPersonByEmail,
  getPersonByUsername,
  getPersonByGoogleId,
  getPersonByFacebookId,
  addPerson,
  updatePerson,
  deletePerson,
  applyToFair,
  getInvitations,
  addInvitation,
  respondToInvitation,
  updateCollaboratorRole,
  removeCollaborator,
  isSlugUnique,
  isCollaborator,
  isCreatorOriginal,
  getActivityFeed,
  getPosts,
  getPostById,
  addPost,
  deletePost,
  reportPost
};

function parsePostData(rawPost, brands = [], fairs = [], organizers = []) {
  let content = rawPost.content || '';
  let fairId = null;
  let brandId = null;
  let organizerId = null;
  let authorType = 'person';

  const metaMatch = content.match(/^\[AOURUM_POST_META:(.*?)\]:\s*/);
  if (metaMatch) {
    try {
      const meta = JSON.parse(metaMatch[1]);
      fairId = meta.fairId ? Number(meta.fairId) : null;
      brandId = meta.brandId ? Number(meta.brandId) : null;
      organizerId = meta.organizerId ? Number(meta.organizerId) : null;
      authorType = meta.authorType || 'person';
      content = content.replace(metaMatch[0], '');
    } catch (e) {}
  }

  const personAuthor = rawPost.people ? {
    id: rawPost.people.id,
    name: rawPost.people.name,
    lastName: rawPost.people.last_name || '',
    username: rawPost.people.username || `user_${rawPost.people.id}`,
    logo: rawPost.people.logo || '',
    occupation: rawPost.people.occupation || ''
  } : null;

  const brandAuthor = brandId ? brands.find(b => Number(b.id) === Number(brandId)) : null;
  const organizerAuthor = organizerId ? organizers.find(o => Number(o.id) === Number(organizerId)) : null;
  const fairObj = fairId ? fairs.find(f => Number(f.id) === Number(fairId)) : null;

  let author = personAuthor;
  let title = personAuthor ? `${personAuthor.name} ${personAuthor.lastName}`.trim() : 'Usuario Aourum';

  if (authorType === 'brand' && brandAuthor) {
    author = {
      id: brandAuthor.id,
      name: brandAuthor.name,
      logo: brandAuthor.logo || '',
      category: brandAuthor.category || 'Marca',
      slug: brandAuthor.slug || brandAuthor.id,
      type: 'brand'
    };
    title = brandAuthor.name;
  } else if (authorType === 'organizer' && organizerAuthor) {
    author = {
      id: organizerAuthor.id,
      name: organizerAuthor.name,
      logo: organizerAuthor.logo || '',
      slug: organizerAuthor.slug || organizerAuthor.id,
      type: 'organizer'
    };
    title = organizerAuthor.name;
  }

  return {
    id: rawPost.id,
    eventType: 'user_post',
    timestamp: rawPost.created_at,
    content,
    description: content,
    image: rawPost.image || null,
    personId: rawPost.person_id,
    fairId,
    brandId,
    organizerId,
    authorType,
    author,
    personAuthor,
    brandAuthor,
    organizerAuthor,
    fair: fairObj ? {
      id: fairObj.id,
      name: fairObj.name,
      location: fairObj.location,
      date: fairObj.date,
      banner: fairObj.banner,
      slug: fairObj.slug || fairObj.id
    } : null
  };
}

async function getPosts(options = {}) {
  const page = Number(options.page) || 1;
  const limit = Number(options.limit) || 50;
  const from = (page - 1) * limit;
  const to = from + limit - 1;

  const [postsRes, brands, fairs, organizers] = await Promise.all([
    supabase
      .from('posts')
      .select(`
        id,
        content,
        image,
        created_at,
        person_id,
        status,
        people:person_id (
          id,
          name,
          last_name,
          username,
          logo,
          occupation
        )
      `, { count: 'exact' })
      .or('status.eq.approved,status.is.null')
      .order('created_at', { ascending: false }),
    getBrands(),
    getFairs(),
    getOrganizers()
  ]);

  if (postsRes.error) throw postsRes.error;

  let items = (postsRes.data || []).map(post => parsePostData(post, brands, fairs, organizers));

  if (options.fairId) {
    items = items.filter(p => Number(p.fairId) === Number(options.fairId));
  }
  if (options.brandId) {
    items = items.filter(p => Number(p.brandId) === Number(options.brandId));
  }
  if (options.personId) {
    items = items.filter(p => Number(p.personId) === Number(options.personId));
  }

  const totalCount = items.length;
  const paginated = items.slice(from, to + 1);

  return { items: paginated, count: totalCount, page, limit };
}

async function getActivityFeed(options = {}) {
  return getPosts(options);
}

async function getPostById(id) {
  const { data, error } = await supabase
    .from('posts')
    .select(`
      id,
      content,
      image,
      created_at,
      person_id,
      status,
      people:person_id (
        id,
        name,
        last_name,
        username,
        logo,
        occupation
      )
    `)
    .eq('id', Number(id))
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;
  const [brands, fairs, organizers] = await Promise.all([getBrands(), getFairs(), getOrganizers()]);
  return parsePostData(data, brands, fairs, organizers);
}

async function addPost(post) {
  const metaObj = {
    fairId: post.fairId ? Number(post.fairId) : null,
    brandId: post.brandId ? Number(post.brandId) : null,
    organizerId: post.organizerId ? Number(post.organizerId) : null,
    authorType: post.authorType || 'person'
  };

  const formattedContent = `[AOURUM_POST_META:${JSON.stringify(metaObj)}]: ${post.content}`;

  const { data, error } = await supabase
    .from('posts')
    .insert([{
      person_id: Number(post.personId),
      content: formattedContent,
      image: post.image || null,
      status: 'approved'
    }])
    .select(`
      id,
      content,
      image,
      created_at,
      person_id,
      status,
      people:person_id (
        id,
        name,
        last_name,
        username,
        logo,
        occupation
      )
    `)
    .single();

  if (error) throw error;
  const [brands, fairs, organizers] = await Promise.all([getBrands(), getFairs(), getOrganizers()]);
  return parsePostData(data, brands, fairs, organizers);
}

async function deletePost(id) {
  const { data, error } = await supabase
    .from('posts')
    .delete()
    .eq('id', Number(id))
    .select();

  if (error) throw error;
  return data && data.length > 0;
}

async function reportPost(id) {
  const { data: post, error: fetchError } = await supabase
    .from('posts')
    .select('reports_count, status')
    .eq('id', Number(id))
    .maybeSingle();

  if (fetchError) throw fetchError;
  if (!post) return null;

  const newReportsCount = (Number(post.reports_count) || 0) + 1;
  let newStatus = post.status || 'approved';

  if (newReportsCount >= 3) {
    newStatus = 'flagged';
  }

  const { data, error } = await supabase
    .from('posts')
    .update({
      reports_count: newReportsCount,
      status: newStatus
    })
    .eq('id', Number(id))
    .select()
    .single();

  if (error) throw error;
  return data;
}


