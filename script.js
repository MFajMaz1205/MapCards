const CONFIG = {
    zones: [
        { name: "Europe", minLat: 36, maxLat: 60, minLon: -9, maxLon: 30 },
        { name: "Amérique du Nord", minLat: 25, maxLat: 55, minLon: -125, maxLon: -70 },
        { name: "Amérique du Sud", minLat: -35, maxLat: 5, minLon: -75, maxLon: -38 },
        { name: "Asie de l'Est", minLat: 20, maxLat: 45, minLon: 100, maxLon: 140 },
        { name: "Afrique", minLat: -30, maxLat: 34, minLon: -15, maxLon: 40 },
        { name: "Australie", minLat: -37, maxLat: -15, minLon: 115, maxLon: 152 }
    ],
    delay: 400,
    boosterCost: 100,
    loadingPhrases: [
        "Scan des coordonnées satellites...",
        "Recherche d'articles sur Wikipédia...",
        "Analyse géologique du terrain...",
        "Calcul des indices de rareté...",
        "Cartographie OpenStreetMap en cours...",
        "Exploration des zones reculées du globe...",
        "Finalisation du tirage du booster..."
    ]
};

const sleep = ms => new Promise(r => setTimeout(r, ms));

// --- 1. INITIALISATION GUN.JS (P2P SANS SERVEUR) ---
const gun = Gun(['https://gun-manhattan.herokuapp.com/gun']);
const marketNode = gun.get('geobooster-marketplace-v1');
const salesInboxNode = gun.get('geobooster-sales-v1');

// --- 2. ÉTAT DU JOUEUR & SAUVEGARDE LOCALSTORAGE ---
let playerState = {
    id: localStorage.getItem('geo_player_id') || 'user_' + Math.random().toString(36).substring(2, 10),
    name: localStorage.getItem('geo_player_name') || 'Explorateur_' + Math.floor(Math.random() * 900 + 100),
    coins: parseInt(localStorage.getItem('geo_player_coins')) || 300,
    collection: JSON.parse(localStorage.getItem('geo_player_collection')) || []
};

let currentBoosterCards = [];
let phraseInterval = null;
const renderedMarketListings = new Set();

function saveGame() {
    localStorage.setItem('geo_player_id', playerState.id);
    localStorage.setItem('geo_player_name', playerState.name);
    localStorage.setItem('geo_player_coins', playerState.coins);
    localStorage.setItem('geo_player_collection', JSON.stringify(playerState.collection));
    updateHeaderUI();
}

function updateHeaderUI() {
    document.getElementById('player-name').textContent = playerState.name;
    document.getElementById('player-coins').textContent = playerState.coins;
    document.getElementById('collection-count').textContent = playerState.collection.length;

    const genBtn = document.getElementById('generate-btn');
    genBtn.disabled = playerState.coins < CONFIG.boosterCost;
}

function changePseudo() {
    const nouveauNom = prompt("Entre ton nouveau pseudo :", playerState.name);
    if (nouveauNom && nouveauNom.trim().length > 0) {
        playerState.name = nouveauNom.trim().substring(0, 20);
        saveGame();
    }
}

function claimFreeCoins() {
    playerState.coins += 50;
    saveGame();
}

// --- 3. NAVIGATION ENTRE ONGLETS ---
function switchTab(tab) {
    const colView = document.getElementById('collection-view');
    const mktView = document.getElementById('market-view');
    const colTab = document.getElementById('tab-collection');
    const mktTab = document.getElementById('tab-market');

    if (tab === 'collection') {
        colView.style.display = 'block';
        mktView.style.display = 'none';
        colTab.classList.add('active');
        mktTab.classList.remove('active');
    } else {
        colView.style.display = 'none';
        mktView.style.display = 'block';
        colTab.classList.remove('active');
        mktTab.classList.add('active');
    }
}

// --- 4. CHARGEMENT DE LA COLLECTION SAUVEGARDÉE ---
function renderSavedCollection() {
    const container = document.getElementById('cards-container');
    container.innerHTML = '';
    playerState.collection.forEach(carte => {
        const cardEl = construireElementCarte(carte, 'collection');
        container.appendChild(cardEl);
    });
}

// --- 5. SYSTÈME DE BOOSTER (5 CARTES EN PARALLÈLE) ---
function tirerRareteAleatoire() {
    const rand = Math.random() * 100;
    if (rand < 2) return { id: "legendaire", label: "LÉGENDAIRE" };
    if (rand < 5) return { id: "epique", label: "ÉPIQUE" };
    if (rand < 15) return { id: "rare", label: "RARE" };
    if (rand < 40) return { id: "peu-commune", label: "PEU COMMUNE" };
    return { id: "commune", label: "COMMUNE" };
}

function startLoadingPhrases() {
    const phraseEl = document.getElementById('loading-phrase');
    let index = 0;
    phraseEl.textContent = CONFIG.loadingPhrases[0];

    if (phraseInterval) clearInterval(phraseInterval);
    phraseInterval = setInterval(() => {
        index = (index + 1) % CONFIG.loadingPhrases.length;
        phraseEl.style.opacity = 0;
        setTimeout(() => {
            phraseEl.textContent = CONFIG.loadingPhrases[index];
            phraseEl.style.opacity = 1;
        }, 200);
    }, 1400);
}

function stopLoadingPhrases() {
    if (phraseInterval) {
        clearInterval(phraseInterval);
        phraseInterval = null;
    }
}

async function openBoosterModal() {
    if (playerState.coins < CONFIG.boosterCost) return;

    // Déduit le prix du booster
    playerState.coins -= CONFIG.boosterCost;
    saveGame();

    const overlay = document.getElementById('booster-overlay');
    const loadingView = document.getElementById('loading-view');
    const revealView = document.getElementById('reveal-view');
    const previewContainer = document.getElementById('booster-cards-preview');

    overlay.classList.add('active');
    loadingView.style.display = 'flex';
    revealView.style.display = 'none';
    previewContainer.innerHTML = '';
    currentBoosterCards = [];

    startLoadingPhrases();

    const promesses = Array.from({ length: 5 }, async () => {
        const lieu = await chercherLieuEtWikipédia();
        const rarete = tirerRareteAleatoire();
        return {
            uid: 'card_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7),
            ...lieu,
            rarete
        };
    });

    currentBoosterCards = await Promise.all(promesses);

    stopLoadingPhrases();

    currentBoosterCards.forEach(carte => {
        const cardEl = construireElementCarte(carte, 'preview');
        previewContainer.appendChild(cardEl);
    });

    loadingView.style.display = 'none';
    revealView.style.display = 'flex';
}

function collectBoosterCards() {
    const overlay = document.getElementById('booster-overlay');
    const mainContainer = document.getElementById('cards-container');

    currentBoosterCards.forEach(carte => {
        playerState.collection.unshift(carte);
        const cardEl = construireElementCarte(carte, 'collection');
        mainContainer.prepend(cardEl);
    });

    saveGame();
    overlay.classList.remove('active');
    switchTab('collection');
}

// --- 6. MARKETPLACE MULTIJOUEUR P2P (VENTE & ACHAT) ---
function sellCard(cardUid) {
    const cardIndex = playerState.collection.findIndex(c => c.uid === cardUid);
    if (cardIndex === -1) return;

    const carte = playerState.collection[cardIndex];
    const priceInput = prompt(`À quel prix (en GéoCoins) veux-tu vendre "${carte.nom}" ?`, "150");
    const price = parseInt(priceInput);

    if (isNaN(price) || price <= 0) {
        alert("Prix invalide.");
        return;
    }

    // Retire la carte de l'inventaire local
    playerState.collection.splice(cardIndex, 1);
    saveGame();
    renderSavedCollection();

    // Publie l'annonce sur le réseau P2P Gun.js
    const listingId = 'listing_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6);
    marketNode.get(listingId).put({
        listingId: listingId,
        sellerId: playerState.id,
        sellerName: playerState.name,
        price: price,
        status: 'available',
        cardData: JSON.stringify(carte)
    });

    alert(`Ta carte "${carte.nom}" est maintenant en vente sur le Marketplace pour ${price} 🪙 !`);
}

function buyCard(listingId, sellerId, price, cardJson) {
    if (playerState.coins < price) {
        alert("Tu n'as pas assez de GéoCoins !");
        return;
    }

    // Marque l'annonce comme vendue sur le réseau P2P
    marketNode.get(listingId).put({ status: 'sold' });

    // Envoie le paiement au vendeur via Gun.js
    const saleId = 'sale_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6);
    salesInboxNode.get(sellerId).get(saleId).put({
        amount: price,
        claimed: false
    });

    // Déduit l'argent et ajoute la carte à l'acheteur
    playerState.coins -= price;
    const carte = JSON.parse(cardJson);
    carte.uid = 'card_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7);
    playerState.collection.unshift(carte);
    
    saveGame();
    renderSavedCollection();
    alert(`Félicitations ! Tu as acheté "${carte.nom}" pour ${price} 🪙 !`);
}

// Écoute des annonces du Marketplace en temps réel
function initMarketplaceListener() {
    const marketContainer = document.getElementById('market-container');

    marketNode.map().on((listing, listingId) => {
        if (!listing || !listing.cardData) return;

        const existingCard = document.getElementById(`market-${listingId}`);

        // Si l'annonce est vendue ou annulée, on la retire de l'affichage
        if (listing.status !== 'available') {
            if (existingCard) existingCard.remove();
            return;
        }

        if (existingCard) return;

        try {
            const carte = JSON.parse(listing.cardData);
            const isMine = listing.sellerId === playerState.id;
            const cardEl = construireElementCarte(carte, 'market', {
                listingId: listingId,
                sellerId: listing.sellerId,
                sellerName: listing.sellerName,
                price: listing.price,
                isMine: isMine,
                cardData: listing.cardData
            });
            cardEl.id = `market-${listingId}`;
            marketContainer.prepend(cardEl);
        } catch (e) {
            console.warn("Erreur de lecture d'une annonce P2P", e);
        }
    });

    // Écoute des ventes réalisées par le joueur pour créditer ses GéoCoins
    salesInboxNode.get(playerState.id).map().on((sale, saleId) => {
        if (sale && !sale.claimed && sale.amount > 0) {
            salesInboxNode.get(playerState.id).get(saleId).put({ claimed: true });
            playerState.coins += sale.amount;
            saveGame();
            alert(`💰 Bonne nouvelle ! Une de tes cartes a été vendue sur le Marketplace (+${sale.amount} 🪙) !`);
        }
    });
}

// --- 7. CONSTRUCTION DU DOM D'UNE CARTE ---
function construireElementCarte(carte, mode = 'collection', marketInfo = null) {
    const offset = 0.015;
    const bboxMinLon = carte.lon - offset;
    const bboxMinLat = carte.lat - offset;
    const bboxMaxLon = carte.lon + offset;
    const bboxMaxLat = carte.lat + offset;

    const embedUrl = `https://www.openstreetmap.org/export/embed?bbox=${bboxMinLon}%2C${bboxMinLat}%2C${bboxMaxLon}%2C${bboxMaxLat}&layer=mapnik&marker=${carte.lat}%2C${carte.lon}`;
    const osmLink = `https://www.openstreetmap.org/#map=15/${carte.lat}/${carte.lon}`;

    const card = document.createElement('div');
    card.className = `card ${carte.rarete.id}`;

    let sellerBadgeHTML = '';
    let actionButtonHTML = '';

    if (mode === 'collection') {
        actionButtonHTML = `<button class="sell-btn" onclick="sellCard('${carte.uid}')">Vendre</button>`;
    } else if (mode === 'market' && marketInfo) {
        sellerBadgeHTML = `<div class="seller-badge">Vendeur : ${marketInfo.sellerName}</div>`;
        if (marketInfo.isMine) {
            actionButtonHTML = `<span style="font-size:0.8rem; color:#94a3b8;">En vente (${marketInfo.price} 🪙)</span>`;
        } else {
            const safeJson = marketInfo.cardData.replace(/'/g, "&#39;").replace(/"/g, "&quot;");
            actionButtonHTML = `<button class="buy-btn" onclick="buyCard('${marketInfo.listingId}', '${marketInfo.sellerId}', ${marketInfo.price}, '${safeJson}')">Acheter (${marketInfo.price} 🪙)</button>`;
        }
    }

    card.innerHTML = `
        <div class="map-container-wrapper">
            ${sellerBadgeHTML}
            <div class="card-rarity-badge badge-${carte.rarete.id}">${carte.rarete.label}</div>
            <iframe class="map-box" src="${embedUrl}"></iframe>
        </div>
        <div class="card-content">
            <h2 class="card-title">${carte.nom}</h2>
            <p class="card-desc">${carte.description}</p>
            <div class="card-footer">
                <div class="card-coords">
                    Lat: ${Number(carte.lat).toFixed(5)}<br>
                    Lon: ${Number(carte.lon).toFixed(5)}
                </div>
                <div class="card-buttons">
                    <a href="${carte.url}" target="_blank" class="wiki-btn">Wikipédia</a>
                    <a href="${osmLink}" target="_blank" class="osm-btn">OSM</a>
                    ${actionButtonHTML}
                </div>
            </div>
        </div>
    `;

    return card;
}

// --- 8. RECHERCHE WIKIPÉDIA ---
async function chercherLieuEtWikipédia() {
    let attempts = 0;

    while (attempts < 15) {
        attempts++;
        
        const zone = CONFIG.zones[Math.floor(Math.random() * CONFIG.zones.length)];
        const lat = (Math.random() * (zone.maxLat - zone.minLat) + zone.minLat).toFixed(5);
        const lon = (Math.random() * (zone.maxLon - zone.minLon) + zone.minLon).toFixed(5);

        try {
            const wikiRes = await fetch(`https://fr.wikipedia.org/w/api.php?action=query&list=geosearch&gscoord=${lat}%7C${lon}&gsradius=10000&gslimit=1&format=json&origin=*`);
            const wikiData = await wikiRes.json();

            if (wikiData.query && wikiData.query.geosearch && wikiData.query.geosearch.length > 0) {
                const place = wikiData.query.geosearch[0];
                const wikiTitle = place.title;
                const wikiLat = place.lat;
                const wikiLon = place.lon;
                
                const summaryRes = await fetch(`https://fr.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(wikiTitle)}`);
                const summaryData = await summaryRes.json();

                if (summaryData && summaryData.extract) {
                    return {
                        lat: wikiLat,
                        lon: wikiLon,
                        nom: summaryData.title,
                        description: summaryData.extract,
                        url: summaryData.content_urls.desktop.page
                    };
                }
            }
        } catch (e) {
            console.warn("Erreur lors de la recherche Wikipédia, nouvel essai...");
        }
        await sleep(CONFIG.delay);
    }

    return {
        lat: 48.85837,
        lon: 2.29448,
        nom: "Tour Eiffel",
        description: "La tour Eiffel est une tour de fer puddlé de 330 mètres de hauteur située à Paris, en France.",
        url: "https://fr.wikipedia.org/wiki/Tour_Eiffel"
    };
}

// --- DÉMARRAGE ---
saveGame();
renderSavedCollection();
initMarketplaceListener();