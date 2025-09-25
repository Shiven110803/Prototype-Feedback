from __future__ import annotations

import os
import json
import datetime as dt
from typing import List, Optional, Dict, Any

from fastapi import FastAPI, HTTPException, Depends, Header, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field
from sqlalchemy import (
    create_engine, Integer, String, Boolean, DateTime, ForeignKey, Text, UniqueConstraint, func
)
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship, sessionmaker, Session

from sklearn.linear_model import LogisticRegression
import numpy as np
import joblib

# -----------------------------------------------------------------------------
# Database setup
# -----------------------------------------------------------------------------
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DB_PATH = os.path.join(BASE_DIR, "database.db")
DATABASE_URL = f"sqlite:///{DB_PATH}"

engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False})
SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)


class Base(DeclarativeBase):
    pass


class Attribute(Base):
    __tablename__ = "attributes"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(100), unique=True, index=True)
    description: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    active: Mapped[bool] = mapped_column(Boolean, default=True)

    team_links: Mapped[List[TeamAttribute]] = relationship("TeamAttribute", back_populates="attribute")
    responses: Mapped[List[QuestionnaireResponse]] = relationship("QuestionnaireResponse", back_populates="attribute")


class Team(Base):
    __tablename__ = "teams"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(120), unique=True, index=True)
    meta: Mapped[Optional[str]] = mapped_column(Text, nullable=True)  # JSON blob

    attributes: Mapped[List[TeamAttribute]] = relationship("TeamAttribute", back_populates="team", cascade="all, delete-orphan")
    feedback: Mapped[List[Feedback]] = relationship("Feedback", back_populates="team")


class TeamAttribute(Base):
    __tablename__ = "team_attributes"
    __table_args__ = (UniqueConstraint("team_id", "attribute_id", name="uq_team_attr"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    team_id: Mapped[int] = mapped_column(ForeignKey("teams.id", ondelete="CASCADE"))
    attribute_id: Mapped[int] = mapped_column(ForeignKey("attributes.id", ondelete="CASCADE"))
    value: Mapped[int] = mapped_column(Integer, default=1)  # 1 if team has attribute, 0 otherwise

    team: Mapped[Team] = relationship("Team", back_populates="attributes")
    attribute: Mapped[Attribute] = relationship("Attribute", back_populates="team_links")


class Questionnaire(Base):
    __tablename__ = "questionnaires"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[Optional[str]] = mapped_column(String(120), nullable=True)
    created_at: Mapped[dt.datetime] = mapped_column(DateTime, default=dt.datetime.utcnow)

    responses: Mapped[List[QuestionnaireResponse]] = relationship("QuestionnaireResponse", back_populates="questionnaire", cascade="all, delete-orphan")
    feedback: Mapped[List[Feedback]] = relationship("Feedback", back_populates="questionnaire")


class QuestionnaireResponse(Base):
    __tablename__ = "questionnaire_responses"
    __table_args__ = (UniqueConstraint("questionnaire_id", "attribute_id", name="uq_response_once"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    questionnaire_id: Mapped[int] = mapped_column(ForeignKey("questionnaires.id", ondelete="CASCADE"))
    attribute_id: Mapped[int] = mapped_column(ForeignKey("attributes.id", ondelete="CASCADE"))
    value: Mapped[int] = mapped_column(Integer)  # 1 for yes, 0 for no

    questionnaire: Mapped[Questionnaire] = relationship("Questionnaire", back_populates="responses")
    attribute: Mapped[Attribute] = relationship("Attribute", back_populates="responses")


class Feedback(Base):
    __tablename__ = "feedback"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    questionnaire_id: Mapped[int] = mapped_column(ForeignKey("questionnaires.id", ondelete="CASCADE"))
    team_id: Mapped[int] = mapped_column(ForeignKey("teams.id", ondelete="CASCADE"))
    supported: Mapped[int] = mapped_column(Integer)  # 1 = supported/liked, 0 = not supported
    created_at: Mapped[dt.datetime] = mapped_column(DateTime, default=dt.datetime.utcnow)

    questionnaire: Mapped[Questionnaire] = relationship("Questionnaire", back_populates="feedback")
    team: Mapped[Team] = relationship("Team", back_populates="feedback")


# Create tables
Base.metadata.create_all(engine)


# Dependency

def get_db() -> Session:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


# -----------------------------------------------------------------------------
# ML Model persistence
# -----------------------------------------------------------------------------
MODEL_DIR = os.path.join(BASE_DIR, "model")
# sport-aware model paths
def _model_paths(sport: Optional[str] = None) -> tuple[str, str]:
    suffix = (sport or "default").lower()
    return (
        os.path.join(MODEL_DIR, f"model_{suffix}.pkl"),
        os.path.join(MODEL_DIR, f"model_meta_{suffix}.json"),
    )

os.makedirs(MODEL_DIR, exist_ok=True)


def save_model(model: Any, attribute_ids: List[int], team_ids: List[int], sport: Optional[str] = None) -> None:
    model_path, meta_path = _model_paths(sport)
    joblib.dump(model, model_path)
    with open(meta_path, "w", encoding="utf-8") as f:
        json.dump({
            "attribute_ids": attribute_ids,
            "team_ids": team_ids,
            "saved_at": dt.datetime.utcnow().isoformat() + "Z",
            "sklearn": type(model).__name__,
            "sport": (sport or "default"),
        }, f)


def load_model(sport: Optional[str] = None) -> tuple[Optional[Any], Optional[List[int]], Optional[List[int]]]:
    model_path, meta_path = _model_paths(sport)
    if not (os.path.exists(model_path) and os.path.exists(meta_path)):
        return None, None, None
    model = joblib.load(model_path)
    with open(meta_path, "r", encoding="utf-8") as f:
        meta = json.load(f)
    return model, meta.get("attribute_ids", []), meta.get("team_ids", [])


# -----------------------------------------------------------------------------
# Pydantic Schemas
# -----------------------------------------------------------------------------
class AttributeCreate(BaseModel):
    name: str
    description: Optional[str] = None
    active: bool = True


class AttributeOut(BaseModel):
    id: int
    name: str
    description: Optional[str] = None
    active: bool

    class Config:
        from_attributes = True


class TeamCreate(BaseModel):
    name: str
    meta: Optional[Dict[str, Any]] = None


class TeamOut(BaseModel):
    id: int
    name: str
    meta: Optional[Dict[str, Any]] = None
    attributes: Dict[int, int] = Field(default_factory=dict, description="attribute_id -> value")


class TeamAttributeSet(BaseModel):
    attributes: Dict[int, int]  # attribute_id -> 0/1


class QuestionnaireCreate(BaseModel):
    user_id: Optional[str] = None


class QuestionnaireOut(BaseModel):
    id: int
    user_id: Optional[str]
    created_at: dt.datetime
    attributes: List[AttributeOut]


class ResponseItem(BaseModel):
    attribute_id: int
    value: int  # 0/1


class ResponsesIn(BaseModel):
    responses: List[ResponseItem]


class FeedbackIn(BaseModel):
    questionnaire_id: int
    team_id: int
    supported: int  # 0/1


class TrainOut(BaseModel):
    trained_on_rows: int
    attributes: List[int]
    teams: List[int]
    saved: bool


class PredictionIn(BaseModel):
    questionnaire_id: int
    blend: Optional[float] = Field(default=None, description="If provided and model exists, final_score = blend*model + (1-blend)*heuristic")
    weights_profile: Optional[str] = Field(default="sentiment_v1", description="Weight profile for heuristic: 'sentiment_v1' or 'uniform'")


class TeamScore(BaseModel):
    team_id: int
    team_name: str
    score: float


class PredictionOut(BaseModel):
    questionnaire_id: int
    scores: List[TeamScore]
    model_used: Optional[str]


class AnalyticsOut(BaseModel):
    total_questionnaires: int
    total_feedback: int
    total_teams: int
    total_attributes: int
    attribute_popularity: List[Dict[str, Any]]
    team_support_rate: List[Dict[str, Any]]


# -----------------------------------------------------------------------------
# FastAPI app
# -----------------------------------------------------------------------------
app = FastAPI(title="Smart Feedback & Analytics API", version="0.1.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mount static UI
UI_DIR = os.path.join(BASE_DIR, "ui")
os.makedirs(UI_DIR, exist_ok=True)
app.mount("/ui", StaticFiles(directory=UI_DIR, html=True), name="ui")


# ----------------------- Attribute Endpoints ---------------------------------
@app.post("/attributes", response_model=AttributeOut)
def create_attribute(payload: AttributeCreate, db: Session = Depends(get_db)):
    exists = db.query(Attribute).filter(func.lower(Attribute.name) == payload.name.lower()).first()
    if exists:
        raise HTTPException(status_code=400, detail="Attribute name already exists")
    attr = Attribute(name=payload.name, description=payload.description, active=payload.active)
    db.add(attr)
    db.commit()
    db.refresh(attr)
    return attr


@app.get("/attributes", response_model=List[AttributeOut])
def list_attributes(db: Session = Depends(get_db)):
    return db.query(Attribute).order_by(Attribute.id.asc()).all()


# -------------------------- Team Endpoints -----------------------------------
@app.post("/teams", response_model=TeamOut)
def create_team(payload: TeamCreate, db: Session = Depends(get_db)):
    exists = db.query(Team).filter(func.lower(Team.name) == payload.name.lower()).first()
    if exists:
        raise HTTPException(status_code=400, detail="Team name already exists")
    meta = json.dumps(payload.meta) if payload.meta is not None else None
    team = Team(name=payload.name, meta=meta)
    db.add(team)
    db.commit()
    db.refresh(team)
    return _team_to_out(team, db)


@app.get("/teams", response_model=List[TeamOut])
def list_teams(db: Session = Depends(get_db), sport: Optional[str] = Query(default=None)):
    teams = db.query(Team).order_by(Team.id.asc()).all()
    if sport:
        def _sport_of(t: Team) -> Optional[str]:
            try:
                m = json.loads(t.meta) if t.meta else {}
                return (m or {}).get("sport")
            except Exception:
                return None
        teams = [t for t in teams if (_sport_of(t) or "").lower() == sport.lower()]
    return [_team_to_out(t, db) for t in teams]


@app.get("/teams/{team_id}", response_model=TeamOut)
def get_team(team_id: int, db: Session = Depends(get_db)):
    team = db.get(Team, team_id)
    if not team:
        raise HTTPException(status_code=404, detail="Team not found")
    return _team_to_out(team, db)


@app.post("/teams/{team_id}/attributes", response_model=TeamOut)
def set_team_attributes(team_id: int, payload: TeamAttributeSet, db: Session = Depends(get_db)):
    team = db.get(Team, team_id)
    if not team:
        raise HTTPException(status_code=404, detail="Team not found")

    # Validate attributes
    valid_attr_ids = {a.id for a in db.query(Attribute.id).all()}
    for aid in payload.attributes.keys():
        if aid not in valid_attr_ids:
            raise HTTPException(status_code=400, detail=f"Attribute {aid} does not exist")

    # Upsert team attributes
    existing = {ta.attribute_id: ta for ta in db.query(TeamAttribute).filter(TeamAttribute.team_id == team_id).all()}
    for aid, val in payload.attributes.items():
        v = 1 if val else 0
        if aid in existing:
            existing[aid].value = v
        else:
            db.add(TeamAttribute(team_id=team_id, attribute_id=aid, value=v))

    db.commit()
    db.refresh(team)
    return _team_to_out(team, db)


def _team_to_out(team: Team, db: Session) -> TeamOut:
    attrs = db.query(TeamAttribute).filter(TeamAttribute.team_id == team.id).all()
    attr_map = {a.attribute_id: a.value for a in attrs}
    meta = json.loads(team.meta) if team.meta else None
    return TeamOut(id=team.id, name=team.name, meta=meta, attributes=attr_map)


# ----------------------- Questionnaire Endpoints ------------------------------
@app.post("/questionnaires", response_model=QuestionnaireOut)
def create_questionnaire(payload: QuestionnaireCreate, db: Session = Depends(get_db)):
    q = Questionnaire(user_id=payload.user_id)
    db.add(q)
    db.commit()
    db.refresh(q)

    attributes = db.query(Attribute).filter(Attribute.active == True).order_by(Attribute.id.asc()).all()
    return QuestionnaireOut(
        id=q.id,
        user_id=q.user_id,
        created_at=q.created_at,
        attributes=[AttributeOut.model_validate(a) for a in attributes],
    )


@app.post("/questionnaires/{questionnaire_id}/responses")
def submit_responses(questionnaire_id: int, payload: ResponsesIn, db: Session = Depends(get_db)):
    questionnaire = db.get(Questionnaire, questionnaire_id)
    if not questionnaire:
        raise HTTPException(status_code=404, detail="Questionnaire not found")

    valid_attr_ids = {a.id for a in db.query(Attribute.id).all()}
    for item in payload.responses:
        if item.attribute_id not in valid_attr_ids:
            raise HTTPException(status_code=400, detail=f"Attribute {item.attribute_id} does not exist")
        val = 1 if item.value else 0
        existing = db.query(QuestionnaireResponse).filter(
            QuestionnaireResponse.questionnaire_id == questionnaire_id,
            QuestionnaireResponse.attribute_id == item.attribute_id,
        ).first()
        if existing:
            existing.value = val
        else:
            db.add(QuestionnaireResponse(
                questionnaire_id=questionnaire_id,
                attribute_id=item.attribute_id,
                value=val,
            ))

    db.commit()
    return {"status": "ok"}


# ----------------------------- Feedback --------------------------------------
@app.post("/feedback")
def submit_feedback(payload: FeedbackIn, db: Session = Depends(get_db)):
    q = db.get(Questionnaire, payload.questionnaire_id)
    t = db.get(Team, payload.team_id)
    if not q or not t:
        raise HTTPException(status_code=404, detail="Questionnaire or Team not found")

    fb = Feedback(
        questionnaire_id=payload.questionnaire_id,
        team_id=payload.team_id,
        supported=1 if payload.supported else 0,
    )
    db.add(fb)
    db.commit()
    return {"status": "ok", "feedback_id": fb.id}


# ------------------------------ Training -------------------------------------
@app.post("/train", response_model=TrainOut)
def train_model(db: Session = Depends(get_db), sport: Optional[str] = Query(default=None, description="Optional sport filter e.g. 'cricket' or 'football'")):
    # Build dataset rows = each feedback entry
    feedback_rows = db.query(Feedback).all()
    if not feedback_rows:
        raise HTTPException(status_code=400, detail="No feedback available for training")

    # Attribute universe and team universe
    attributes = db.query(Attribute).order_by(Attribute.id.asc()).all()
    attribute_ids = [a.id for a in attributes]
    teams = db.query(Team).order_by(Team.id.asc()).all()
    if sport:
        def _sport_of(t: Team) -> Optional[str]:
            try:
                m = json.loads(t.meta) if t.meta else {}
                return (m or {}).get("sport")
            except Exception:
                return None
        teams = [t for t in teams if (_sport_of(t) or "").lower() == sport.lower()]
    team_ids = [t.id for t in teams]
    allowed_team_ids = set(team_ids)

    # Preload maps
    team_attr_map: Dict[int, Dict[int, int]] = {
        t.id: {ta.attribute_id: ta.value for ta in db.query(TeamAttribute).filter(TeamAttribute.team_id == t.id)}
        for t in teams
    }
    q_resp_map: Dict[int, Dict[int, int]] = {}

    X: List[List[int]] = []
    y: List[int] = []

    for fb in feedback_rows:
        # Skip feedback for teams not in the selected universe (prevents cross-sport leakage)
        if fb.team_id not in allowed_team_ids:
            continue
        # Load questionnaire responses once per questionnaire
        if fb.questionnaire_id not in q_resp_map:
            q_resps = db.query(QuestionnaireResponse).filter(
                QuestionnaireResponse.questionnaire_id == fb.questionnaire_id
            ).all()
            q_resp_map[fb.questionnaire_id] = {r.attribute_id: r.value for r in q_resps}

        user_prefs = q_resp_map.get(fb.questionnaire_id, {})
        team_attrs = team_attr_map.get(fb.team_id, {})

        # Feature: for each attribute id, 1 if user wants it and team has it, else 0
        features = [int(user_prefs.get(aid, 0) and team_attrs.get(aid, 0)) for aid in attribute_ids]
        X.append(features)
        y.append(int(fb.supported))

    if len(set(y)) < 2:
        raise HTTPException(status_code=400, detail="Not enough class variety in feedback to train a model")

    # Balance classes to avoid over-favoring teams with more positive labels
    model = LogisticRegression(max_iter=1000, class_weight='balanced')
    model.fit(np.array(X), np.array(y))

    save_model(model, attribute_ids, team_ids, sport=sport)

    return TrainOut(
        trained_on_rows=len(X),
        attributes=attribute_ids,
        teams=team_ids,
        saved=True,
    )


# ------------------------------ Prediction -----------------------------------
@app.post("/predict", response_model=PredictionOut)
def predict(payload: PredictionIn, db: Session = Depends(get_db), sport: Optional[str] = Query(default=None, description="Optional sport filter e.g. 'cricket' or 'football'")):
    q = db.get(Questionnaire, payload.questionnaire_id)
    if not q:
        raise HTTPException(status_code=404, detail="Questionnaire not found")

    # Load all attributes and teams
    attributes = db.query(Attribute).order_by(Attribute.id.asc()).all()
    attribute_ids = [a.id for a in attributes]
    teams = db.query(Team).order_by(Team.id.asc()).all()

    # Load user responses
    q_resps = db.query(QuestionnaireResponse).filter(QuestionnaireResponse.questionnaire_id == q.id).all()
    user_prefs = {r.attribute_id: r.value for r in q_resps}

    # Weight profiles for heuristic
    weight_profiles: Dict[str, Dict[str, float]] = {
        "uniform": {},
        "sentiment_v1": {
            "Community Engagement": 1.4,
            "Possession Play": 1.2,
            "Youth Academy": 1.3,
            "National Team Contributors": 1.3,
            "Iconic Players": 1.2,
            "Atmospheric Stadium": 1.2,
            "Budget Conscious": 1.0,
            "Derby Specialists": 1.1,
            "Big Match Temperament": 1.2,
            "Sustainability Focus": 1.0,
            "Historic Success": 1.3,
            "Global Fanbase": 1.2,
        },
    }

    # Build attribute name map for weights
    attr_name_by_id = {a.id: a.name for a in attributes}
    weights_by_id: Dict[int, float] = {}
    selected_profile = (payload.weights_profile or "sentiment_v1").lower()
    prof = weight_profiles.get(selected_profile, weight_profiles["uniform"])
    for aid in attribute_ids:
        w = prof.get(attr_name_by_id[aid], 1.0)
        weights_by_id[aid] = float(w)

    # Load model if present
    model, model_attr_ids, _ = load_model(sport=sport)

    scores: List[TeamScore] = []

    for t in teams:
        team_attrs = {ta.attribute_id: ta.value for ta in db.query(TeamAttribute).filter(TeamAttribute.team_id == t.id)}
        # Feature vector for model
        if model is not None and model_attr_ids:
            feats = [int(user_prefs.get(aid, 0) and team_attrs.get(aid, 0)) for aid in model_attr_ids]
        else:
            feats = [int(user_prefs.get(aid, 0) and team_attrs.get(aid, 0)) for aid in attribute_ids]

        # Weighted heuristic score
        desired_w = sum(weights_by_id[aid] for aid, v in user_prefs.items() if v == 1)
        if desired_w == 0:
            heur = 0.0
        else:
            match_w = sum(weights_by_id[aid] for aid, v in user_prefs.items() if v == 1 and team_attrs.get(aid, 0) == 1)
            heur = match_w / desired_w

        # Combine with model if available
        if model is not None:
            model_prob = float(model.predict_proba(np.array(feats).reshape(1, -1))[0, 1])
            model_used = type(model).__name__
            if payload.blend is not None and 0.0 <= payload.blend <= 1.0:
                prob = float(payload.blend) * model_prob + (1.0 - float(payload.blend)) * heur
            else:
                prob = model_prob  # default: keep previous behavior unless blend provided
        else:
            prob = heur
            model_used = None

        scores.append(TeamScore(team_id=t.id, team_name=t.name, score=prob))

    scores.sort(key=lambda s: s.score, reverse=True)

    return PredictionOut(
        questionnaire_id=q.id,
        scores=scores,
        model_used=model_used if model is not None else None,
    )


# ------------------------------ Analytics ------------------------------------
@app.get("/analytics", response_model=AnalyticsOut)
def analytics(db: Session = Depends(get_db)):
    total_questionnaires = db.query(func.count(Questionnaire.id)).scalar() or 0
    total_feedback = db.query(func.count(Feedback.id)).scalar() or 0
    total_teams = db.query(func.count(Team.id)).scalar() or 0
    total_attributes = db.query(func.count(Attribute.id)).scalar() or 0

    # Attribute popularity: how often users answered yes per attribute
    rows = (
        db.query(Attribute.id, Attribute.name, func.sum(QuestionnaireResponse.value).label("yes_count"), func.count(QuestionnaireResponse.id).label("total"))
        .join(QuestionnaireResponse, QuestionnaireResponse.attribute_id == Attribute.id, isouter=True)
        .group_by(Attribute.id, Attribute.name)
        .order_by(Attribute.id.asc())
        .all()
    )
    attribute_popularity = [
        {
            "attribute_id": r[0],
            "name": r[1],
            "yes_count": int(r[2] or 0),
            "total_answers": int(r[3] or 0),
            "yes_rate": (float(r[2]) / float(r[3])) if (r[3] or 0) > 0 else 0.0,
        }
        for r in rows
    ]

    # Team support rate from feedback
    rows2 = (
        db.query(Team.id, Team.name, func.sum(Feedback.supported).label("yes"), func.count(Feedback.id).label("total"))
        .join(Feedback, Feedback.team_id == Team.id, isouter=True)
        .group_by(Team.id, Team.name)
        .order_by(Team.id.asc())
        .all()
    )
    team_support_rate = [
        {
            "team_id": r[0],
            "team_name": r[1],
            "support_yes": int(r[2] or 0),
            "total": int(r[3] or 0),
            "support_rate": (float(r[2]) / float(r[3])) if (r[3] or 0) > 0 else 0.0,
        }
        for r in rows2
    ]

    return AnalyticsOut(
        total_questionnaires=total_questionnaires,
        total_feedback=total_feedback,
        total_teams=total_teams,
        total_attributes=total_attributes,
        attribute_popularity=attribute_popularity,
        team_support_rate=team_support_rate,
    )


# ------------------------------ Root -----------------------------------------
@app.get("/")
def root():
    return {"status": "ok", "service": "Smart Feedback & Analytics API"}


# ------------------------------ Dev server -----------------------------------
# Run: uvicorn app:app --reload --port 8000


# ------------------------------ Admin ----------------------------------------
# Simple header token protection for admin endpoints
ADMIN_TOKEN = os.getenv("ADMIN_TOKEN", "dev-admin")


def require_admin(x_admin_token: str = Header("", alias="X-Admin-Token")):
    if x_admin_token != ADMIN_TOKEN:
        raise HTTPException(status_code=401, detail="Invalid or missing admin token")
    return True


@app.post("/admin/reset-db")
def admin_reset_db(_: bool = Depends(require_admin), db: Session = Depends(get_db)):
    # Drop and recreate all tables
    db.close()
    Base.metadata.drop_all(engine)
    Base.metadata.create_all(engine)
    return {"status": "ok", "message": "Database schema reset"}


@app.post("/admin/delete-model")
def admin_delete_model(_: bool = Depends(require_admin)):
    removed = []
    for p in [MODEL_PATH, META_PATH]:
        if os.path.exists(p):
            os.remove(p)
            removed.append(os.path.basename(p))
    return {"status": "ok", "removed": removed}


@app.post("/admin/reseed-demo")
def admin_reseed_demo(_: bool = Depends(require_admin), db: Session = Depends(get_db)):
    """Populate a small demo dataset for quick testing."""
    # Clear existing
    Base.metadata.drop_all(engine)
    Base.metadata.create_all(engine)

    # Attributes
    attrs = [
        Attribute(name="Offensive Style", description="Prefers attacking play", active=True),
        Attribute(name="Defense Focus", description="Strong defensive approach", active=True),
        Attribute(name="Youth Development", description="Invests in young players", active=True),
        Attribute(name="Local Talent", description="Prioritizes local players", active=True),
        Attribute(name="Big Budget", description="High spending capacity", active=True),
    ]
    db.add_all(attrs)
    db.commit()
    for a in attrs:
        db.refresh(a)

    # Teams
    city = Team(name="City FC", meta=json.dumps({"league": "Premier"}))
    united = Team(name="United SC", meta=json.dumps({"league": "Championship"}))
    rovers = Team(name="Rovers", meta=json.dumps({"league": "League One"}))
    db.add_all([city, united, rovers])
    db.commit()
    for t in (city, united, rovers):
        db.refresh(t)

    attr_id = {a.name: a.id for a in attrs}

    # Team attributes
    def set_team_attrs(team_id: int, mapping: Dict[str, int]):
        for name, val in mapping.items():
            db.add(TeamAttribute(team_id=team_id, attribute_id=attr_id[name], value=1 if val else 0))
        db.commit()

    set_team_attrs(city.id, {
        "Offensive Style": 1,
        "Defense Focus": 0,
        "Youth Development": 1,
        "Local Talent": 0,
        "Big Budget": 1,
    })
    set_team_attrs(united.id, {
        "Offensive Style": 0,
        "Defense Focus": 1,
        "Youth Development": 0,
        "Local Talent": 1,
        "Big Budget": 0,
    })
    set_team_attrs(rovers.id, {
        "Offensive Style": 1,
        "Defense Focus": 1,
        "Youth Development": 0,
        "Local Talent": 1,
        "Big Budget": 0,
    })

    # Questionnaires and responses
    q1 = Questionnaire(user_id="user-demo-1")
    q2 = Questionnaire(user_id="user-demo-2")
    db.add_all([q1, q2])
    db.commit()
    db.refresh(q1)
    db.refresh(q2)

    def add_responses(qid: int, mapping: Dict[str, int]):
        for name, val in mapping.items():
            db.add(QuestionnaireResponse(questionnaire_id=qid, attribute_id=attr_id[name], value=1 if val else 0))
        db.commit()

    add_responses(q1.id, {
        "Offensive Style": 1,
        "Defense Focus": 0,
        "Youth Development": 1,
        "Local Talent": 0,
        "Big Budget": 1,
    })
    add_responses(q2.id, {
        "Offensive Style": 0,
        "Defense Focus": 1,
        "Youth Development": 0,
        "Local Talent": 1,
        "Big Budget": 0,
    })

    # Feedback
    db.add_all([
        Feedback(questionnaire_id=q1.id, team_id=city.id, supported=1),
        Feedback(questionnaire_id=q1.id, team_id=united.id, supported=0),
        Feedback(questionnaire_id=q1.id, team_id=rovers.id, supported=1),
        Feedback(questionnaire_id=q2.id, team_id=city.id, supported=0),
        Feedback(questionnaire_id=q2.id, team_id=united.id, supported=1),
        Feedback(questionnaire_id=q2.id, team_id=rovers.id, supported=1),
    ])
    db.commit()

    return {"status": "ok", "message": "Demo data reseeded", "questionnaires": [q1.id, q2.id]}


@app.post("/admin/reseed-large")
def admin_reseed_large(_: bool = Depends(require_admin), db: Session = Depends(get_db)):
    """Seed 60+ attributes and ~15 famous teams with synthetic data and feedback for training."""
    import random

    Base.metadata.drop_all(engine)
    Base.metadata.create_all(engine)

    # 60 attributes
    attr_names = [
        "High Press", "Counter-Attack", "Possession Play", "Wing Play", "Through Balls",
        "Set Piece Threat", "Compact Defense", "High Line", "Low Block", "Wide Formation",
        "Narrow Formation", "3-Back Preference", "4-Back Preference", "5-Back Flex",
        "Youth Academy", "Star Signings", "Net Spend High", "Budget Conscious",
        "Local Talent Focus", "International Scouting", "National Team Contributors", "Veteran Experience", "Pace & Power",
        "Technical Midfield", "Creative No10", "Target Man", "Press-Resistant",
        "Fullback Overlaps", "Inverted Wingers", "Sweeper Keeper", "Long Shots",
        "Crossing Frequency", "Dribble-Oriented", "Short Passing", "Long Passing",
        "Build From Back", "Direct Play", "Tiki-Taka Tendencies", "Gegenpress Tendencies",
        "Backroom Stability", "Manager Longevity", "Analytics Adoption", "Sports Science",
        "Injury Resilience", "Academy Integration", "Community Engagement",
        "Sustainability Focus", "Global Fanbase", "Historic Success", "Recent Form Strong",
        "Derby Specialists", "European Pedigree", "Big Match Temperament", "Home Fortress",
        "Away Warriors", "Atmospheric Stadium", "Modern Stadium", "Iconic Players",
        "Defensive Mid Anchor", "Box-to-Box Engine", "Ball-Playing CB", "Aerial Dominance"
    ]
    attrs = [Attribute(name=n, description=None, active=True) for n in attr_names]
    db.add_all(attrs)
    db.commit()
    for a in attrs:
        db.refresh(a)
    attr_id = {a.name: a.id for a in attrs}

    # 15 famous teams
    team_names = [
        "Manchester City", "Manchester United", "Liverpool", "Chelsea", "Arsenal",
        "Tottenham Hotspur", "Real Madrid", "FC Barcelona", "Atletico Madrid", "Bayern Munich",
        "Borussia Dortmund", "Paris Saint-Germain", "Juventus", "Inter Milan", "AC Milan"
    ]
    teams = [Team(name=t, meta=json.dumps({"league": "Top"})) for t in team_names]
    db.add_all(teams)
    db.commit()
    for t in teams:
        db.refresh(t)

    # Deterministic assignment of attributes to teams
    random.seed(42)
    for t in teams:
        for a in attrs:
            # Team-specific likelihoods based on name keywords
            prob = 0.5
            name = t.name.lower()
            if "city" in name or "barcelona" in name or "bayern" in name:
                if a.name in {"Possession Play", "High Press", "Build From Back", "Short Passing", "Sports Science", "Analytics Adoption"}:
                    prob = 0.8
            if "real" in name or "juventus" in name or "psg" in name:
                if a.name in {"Star Signings", "Global Fanbase", "Historic Success", "European Pedigree", "Iconic Players"}:
                    prob = 0.85
            if "united" in name or "arsenal" in name:
                if a.name in {"Youth Academy", "Academy Integration", "Technical Midfield"}:
                    prob = 0.75
            if "atletico" in name or "inter" in name:
                if a.name in {"Compact Defense", "Low Block", "Big Match Temperament"}:
                    prob = 0.8

            val = 1 if random.random() < prob else 0
            db.add(TeamAttribute(team_id=t.id, attribute_id=a.id, value=val))
    db.commit()

    # Create synthetic questionnaires and responses
    questionnaires: List[Questionnaire] = []
    for i in range(20):
        q = Questionnaire(user_id=f"synthetic-{i}")
        db.add(q)
        questionnaires.append(q)
    db.commit()
    for q in questionnaires:
        db.refresh(q)

    # Synthetic user profiles biased to some styles
    profiles = [
        {"High Press": 1, "Possession Play": 1, "Short Passing": 1, "Build From Back": 1},
        {"Counter-Attack": 1, "Direct Play": 1, "Pace & Power": 1, "Long Passing": 1},
        {"Compact Defense": 1, "Low Block": 1, "Set Piece Threat": 1},
        {"Youth Academy": 1, "Academy Integration": 1, "Budget Conscious": 1},
        {"Star Signings": 1, "Global Fanbase": 1, "Iconic Players": 1}
    ]

    for idx, q in enumerate(questionnaires):
        base = profiles[idx % len(profiles)]
        # Fill 12 selected preferences; default 0
        chosen = set(base.keys())
        # Add a few random other preferences
        more = random.sample(attr_names, 8)
        chosen.update(more)
        for name in attr_names:
            val = 1 if name in chosen and (name in base or random.random() < 0.3) else 0
            db.add(QuestionnaireResponse(questionnaire_id=q.id, attribute_id=attr_id[name], value=val))
        db.commit()

    # Generate feedback labels comparing preference-team overlap to threshold to ensure both classes
    for q in questionnaires:
        q_prefs = {r.attribute_id: r.value for r in db.query(QuestionnaireResponse).filter(QuestionnaireResponse.questionnaire_id == q.id)}
        for t in teams:
            t_attrs = {ta.attribute_id: ta.value for ta in db.query(TeamAttribute).filter(TeamAttribute.team_id == t.id)}
            overlap = sum(1 for aid, v in q_prefs.items() if v == 1 and t_attrs.get(aid, 0) == 1)
            desired = sum(1 for v in q_prefs.values() if v == 1)
            rate = (overlap / desired) if desired else 0.0
            # stochastic threshold around 0.4 to 0.6
            thr = 0.4 + (hash((q.id, t.id)) % 20) / 100.0
            label = 1 if rate >= thr else 0
            db.add(Feedback(questionnaire_id=q.id, team_id=t.id, supported=label))
    db.commit()

    return {"status": "ok", "attributes": len(attrs), "teams": len(teams), "questionnaires": len(questionnaires)}
