# ⚡ ROXPULSE — HYROX Community Tracker

Application de tracking d'entraînements HYROX avec profils partagés, sessions de groupe et résultats en temps réel.

**Stack** : React + Vite + Supabase + Vercel

---

## 🗄️ Étape 1 — Créer la base de données (Supabase)

1. Va sur [supabase.com](https://supabase.com) → **New Project**
2. Choisis un nom (ex: `roxpulse`) et un mot de passe fort
3. Une fois le projet créé, va dans **SQL Editor** et exécute ce script :

```sql
-- Profils utilisateurs
create table profiles (
  id            uuid default gen_random_uuid() primary key,
  client_id     text unique not null,
  name          text not null,
  city          text default '',
  category      text default 'Débutant',
  color         text default '#FF4700',
  best_time     integer,
  workout_count integer default 0,
  points        integer default 0,
  joined_at     bigint
);

-- Entraînements personnels
create table workouts (
  id           text primary key,
  client_id    text not null,
  total_time   integer default 0,
  stations     jsonb default '{}',
  station_meta jsonb default '[]',
  running      integer default 0,
  notes        text default '',
  date         bigint not null
);

-- Sessions de groupe
create table sessions (
  id                  text primary key,
  title               text not null,
  date                bigint not null,
  location            text not null,
  max_p               integer default 10,
  type                text default 'Simulation complète',
  level               text default 'Tous niveaux',
  organizer_name      text not null,
  organizer_client_id text not null,
  workout             jsonb,
  participants        text[] default '{}'
);

-- Résultats de session (partagés en temps réel)
create table session_results (
  id         uuid default gen_random_uuid() primary key,
  session_id text not null,
  client_id  text not null,
  user_name  text not null,
  color      text default '#FF4700',
  total_time integer default 0,
  stations   jsonb default '{}',
  running    integer default 0,
  logged_at  bigint,
  unique(session_id, client_id)
);

-- Désactiver RLS (app sans authentification)
alter table profiles       disable row level security;
alter table workouts       disable row level security;
alter table sessions       disable row level security;
alter table session_results disable row level security;

-- Activer le temps réel pour les résultats
alter publication supabase_realtime add table session_results;
```

4. Va dans **Project Settings → API** et copie :
   - **Project URL** (ex: `https://xxxx.supabase.co`)
   - **anon / public key**

---

## 💻 Étape 2 — Installation locale

```bash
# Cloner ou dézipper le projet
cd roxpulse

# Installer les dépendances
npm install

# Créer le fichier .env
cp .env.example .env
```

Edite `.env` avec tes clés Supabase :
```
VITE_SUPABASE_URL=https://xxxxxxxxxxxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

```bash
# Lancer en local
npm run dev
```

Ouvre [http://localhost:5173](http://localhost:5173) ✅

---

## 🚀 Étape 3 — Déployer sur Vercel (gratuit)

### Option A — Via GitHub (recommandé)

1. Crée un repo GitHub et pousse le code :
```bash
git init
git add .
git commit -m "ROXPULSE init"
git remote add origin https://github.com/TON_USERNAME/roxpulse.git
git push -u origin main
```

2. Va sur [vercel.com](https://vercel.com) → **New Project** → importe ton repo
3. Dans **Environment Variables**, ajoute :
   - `VITE_SUPABASE_URL` = ta Project URL
   - `VITE_SUPABASE_ANON_KEY` = ta anon key
4. Clique **Deploy** → Vercel te donne une URL publique ! 🎉

### Option B — Via CLI

```bash
npm install -g vercel
vercel
# Suivre les instructions, ajouter les variables d'environnement quand demandé
```

---

## 👥 Partager avec tes amis

Une fois déployé, partage simplement l'URL Vercel.

Chaque ami :
1. Ouvre le lien sur son téléphone ou PC
2. Crée son profil (pseudo, ville, niveau, couleur)
3. Apparaît automatiquement dans le classement **Communauté**
4. Peut rejoindre les sessions et soumettre ses résultats

> **Important** : chaque appareil génère un identifiant unique automatique — pas besoin de compte ou de mot de passe !

---

## 🔑 Fonctionnalités

| Feature | Description |
|--------|-------------|
| 👤 Profils | Création sans compte, identifiant par navigateur |
| 📊 Dashboard | Graphiques d'évolution, radar des stations |
| 🔥 Log workout | 8 stations HYROX + exercices personnalisés |
| 👥 Communauté | Classement en temps réel de tous les utilisateurs |
| 📅 Planning | Sessions de groupe avec admin |
| ⚡ Temps réel | Résultats visibles instantanément pour tous |

---

## 🛠️ Architecture

```
roxpulse/
├── src/
│   ├── App.jsx        # Tous les composants React
│   ├── db.js          # Toutes les opérations Supabase
│   ├── supabase.js    # Client Supabase
│   └── main.jsx       # Point d'entrée
├── index.html
├── vite.config.js
└── package.json
```
