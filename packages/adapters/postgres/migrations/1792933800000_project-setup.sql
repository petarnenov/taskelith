-- Up Migration

-- Projects of G3 item 11: identifiers minted as wire contracts section 6
-- states; the name is DisplayText, at most 1024 characters.
CREATE TABLE projects (
  project_id text PRIMARY KEY CHECK (project_id ~ '^p[0-9a-f]{32}$'),
  name text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 1024),
  created_at timestamptz NOT NULL,
  revision integer NOT NULL CHECK (revision >= 1)
);

-- The defaults that tasks created afterwards take, with their own revision;
-- the last change is absent until the first change after creation.
CREATE TABLE project_defaults (
  project_id text PRIMARY KEY REFERENCES projects (project_id),
  framework_plugin_id text NOT NULL,
  implementers text[] NOT NULL CHECK (cardinality(implementers) BETWEEN 1 AND 8),
  reviewer text NOT NULL,
  spec_approver text NOT NULL CHECK (spec_approver IN ('delegated-reviewer', 'project-maintainer')),
  no_eligible_slot text NOT NULL CHECK (no_eligible_slot IN ('wait', 'reject')),
  revision integer NOT NULL CHECK (revision >= 1),
  changed_by text,
  changed_at timestamptz,
  CHECK ((changed_by IS NULL) = (changed_at IS NULL))
);

-- The auto-merge setting, on from creation (product ports section 6.2);
-- item 23 changes it through the Integrations module.
CREATE TABLE auto_merge_settings (
  project_id text PRIMARY KEY REFERENCES projects (project_id),
  enabled boolean NOT NULL,
  revision integer NOT NULL CHECK (revision >= 1),
  changed_by text,
  changed_at timestamptz,
  CHECK ((changed_by IS NULL) = (changed_at IS NULL))
);

-- NOT VALID keeps roles assigned on G2 project identifiers before projects
-- existed; every role assigned from now on names a project.
ALTER TABLE project_roles ADD CONSTRAINT project_roles_project
  FOREIGN KEY (project_id) REFERENCES projects (project_id) NOT VALID;

-- Down Migration

ALTER TABLE project_roles DROP CONSTRAINT project_roles_project;
DROP TABLE auto_merge_settings;
DROP TABLE project_defaults;
DROP TABLE projects;
