# Smart Feedback & Analytics API (Backend)

A FastAPI backend that:

- Manages `attributes` your users can say Yes/No to.
- Manages `teams` and their associated attributes.
- Records a user's `questionnaire` responses (Yes/No per attribute).
- Records user `feedback` about whether they would support a specific team.
- Trains a simple ML model (Logistic Regression) from accumulated feedback to predict team support likelihood for a user based on their questionnaire responses and team attributes.
- Provides basic `analytics` for attribute popularity and team support rates.

## Tech stack

- FastAPI
- SQLite + SQLAlchemy ORM
- scikit-learn (Logistic Regression)
- Uvicorn (ASGI server)

## Setup

1. Create and activate a virtual environment (recommended)

   ```powershell
   python -m venv .venv
   .venv\Scripts\Activate.ps1
   ```

2. Install dependencies

   ```powershell
   pip install -r requirements.txt
   ```

3. Run the server

   ```powershell
   uvicorn app:app --reload --port 8000
   ```

The API will be available at http://127.0.0.1:8000 and the interactive docs at http://127.0.0.1:8000/docs

## Data model summary

- `Attribute(id, name, description, active)`
- `Team(id, name, meta)` – `meta` is an optional JSON string.
- `TeamAttribute(team_id, attribute_id, value)` – value is 0/1.
- `Questionnaire(id, user_id, created_at)`
- `QuestionnaireResponse(questionnaire_id, attribute_id, value)` – value is 0/1.
- `Feedback(questionnaire_id, team_id, supported)` – supported is 0/1.

## API walkthrough

- Create attributes

  ```http
  POST /attributes
  {
    "name": "Offensive Style",
    "description": "Prefers attacking play",
    "active": true
  }
  ```

  List attributes: `GET /attributes`

- Create a team

  ```http
  POST /teams
  {
    "name": "City FC",
    "meta": { "league": "Premier" }
  }
  ```

  Set team attributes (attribute_id -> 0/1):

  ```http
  POST /teams/{team_id}/attributes
  {
    "attributes": { "1": 1, "2": 0, "3": 1 }
  }
  ```

  List teams: `GET /teams`

- Create questionnaire for a user

  ```http
  POST /questionnaires
  {
    "user_id": "user-123"
  }
  ```

  Submit responses

  ```http
  POST /questionnaires/{questionnaire_id}/responses
  {
    "responses": [
      { "attribute_id": 1, "value": 1 },
      { "attribute_id": 2, "value": 0 },
      { "attribute_id": 3, "value": 1 }
    ]
  }
  ```

- Record feedback (did this user support this team?)

  ```http
  POST /feedback
  {
    "questionnaire_id": 10,
    "team_id": 3,
    "supported": 1
  }
  ```

- Train the model (requires feedback data with both classes 0 and 1)

  ```http
  POST /train
  ```

- Predict recommendations for a questionnaire

  ```http
  POST /predict
  {
    "questionnaire_id": 10
  }
  ```

  Returns `scores` sorted descending by predicted support probability.

- Analytics

  ```http
  GET /analytics
  ```

## Admin utilities

Admin endpoints are protected by a simple header token. Default token is `dev-admin` and can be changed by setting the `ADMIN_TOKEN` environment variable before starting the server.

Header to include:

```
X-Admin-Token: dev-admin
```

Endpoints:

- Reset database schema (drop and recreate all tables)

  ```http
  POST /admin/reset-db
  Headers: X-Admin-Token: dev-admin
  ```

- Delete trained model artifacts

  ```http
  POST /admin/delete-model
  Headers: X-Admin-Token: dev-admin
  ```

- Reseed demo data (attributes, teams, questionnaires, feedback)

  ```http
  POST /admin/reseed-demo
  Headers: X-Admin-Token: dev-admin
  ```

PowerShell examples:

```powershell
Invoke-RestMethod -Method Post -Uri http://127.0.0.1:8000/admin/reset-db -Headers @{ 'X-Admin-Token' = 'dev-admin' }
Invoke-RestMethod -Method Post -Uri http://127.0.0.1:8000/admin/reseed-demo -Headers @{ 'X-Admin-Token' = 'dev-admin' }
Invoke-RestMethod -Method Post -Uri http://127.0.0.1:8000/train
```

## Notes

- If no trained model exists, `/predict` uses a heuristic based on matching desired attributes and team attributes.
- Trained model artifacts are saved to `backend/model/`.
- Database is stored at `backend/database.db` (SQLite). Delete the file to reset data.
