## Copious Default CV Template

This directory contains the template assets for the standard Copious branded CV.

### Files

| File | Purpose |
|------|---------|
| `config.json` | Template metadata and constraints — used by the renderer and (P1) template builder |
| `template.docx` | **The actual Word template** — NOT committed to git. See below. |

### How to get `template.docx`

The `template.docx` file is not committed to the repository because:
1. It may contain sensitive reference candidate data during development.
2. Binary `.docx` files don't diff well in git.

**To create or update the template:**

1. Open one of the reference CV `.docx` files in Word / Google Docs.
2. Strip all candidate-specific content.
3. Replace variable text with the `{{ }}` placeholders from the [template mapping doc](../../docs/cv_schema_template_mapping.md#4-template-mapping-docxtpl).
4. Save as `template.docx` in this directory.

**Placeholder reference** (from `cv_schema_template_mapping.md §4`):

```
COVER PAGE
  {{ candidate.full_name }}
  {{ candidate.role_title }}

RUNNING HEADER (page 2+)
  Copious CV | {{ candidate.full_name }} | {{ candidate.role_title }}

CAREER SUMMARY
  {%tr for b in career_summary.bullets %}
  • {{ b.text | richtext }}
  {%tr endfor %}

TECHNICAL SKILLS TABLE
  {%tr for g in technical_skills.groups %}
  | {{ g.category }} | {{ g.skills }} |
  {%tr endfor %}

{% if education.has_certifications %}EDUCATIONAL QUALIFICATIONS & CERTIFICATIONS{% else %}EDUCATIONAL QUALIFICATIONS{% endif %}
  {%tr for item in education.items %}
  • {{ item.text | richtext }}
  {%tr endfor %}

EMPLOYMENT SUMMARY & PROJECTS
  {% for job in employment %}
  Company: {{ job.company }}
  {% if job.client %}Client: {{ job.client }}{% endif %}
  Role: {{ job.role }}
  Duration: {{ job.duration_display }}
  {% if job.project_name %}Project: {{ job.project_name }}{% endif %}
  {% if job.technology_used %}Technology Used: {{ job.technology_used }}{% endif %}
  {% if job.project_description %}{{ job.project_description | richtext }}{% endif %}
  {%tr for r in job.responsibilities %}
  • {{ r.text | richtext }}
  {%tr endfor %}
  {% endfor %}
```

### Testing the template

Run the renderer against a fixture profile:

```bash
cd apps/api
python -c "
from app.services.template_engine.renderer import render
from app.schemas.candidate_profile import CandidateProfile
import json

with open('tests/fixtures/profiles/rupesh_g.json') as f:
    profile = CandidateProfile.model_validate(json.load(f))

docx_bytes = render('../../templates/copious-default/template.docx', profile)
with open('/tmp/test_output.docx', 'wb') as f:
    f.write(docx_bytes)
print('Rendered to /tmp/test_output.docx')
"
```
