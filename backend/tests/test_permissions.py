from app.modules.iam.service import has_permission


def test_permission_is_exact_key() -> None:
    granted = {"org.branch.read", "org.branch.update"}
    assert has_permission(granted, "org.branch.read")
    assert not has_permission(granted, "org.branch.delete")
    assert not has_permission(granted, "org.branch")


def test_union_of_role_bundles() -> None:
    admin = {"iam.role.read", "org.branch.delete"}
    supervisor = {"org.branch.read", "org.branch.update"}
    effective = admin | supervisor
    assert has_permission(effective, "org.branch.delete")
    assert has_permission(effective, "org.branch.update")
    assert not has_permission(supervisor, "iam.role.read")


def test_department_permission_is_exact_key() -> None:
    granted = {"org.department.read", "org.department.update"}
    assert has_permission(granted, "org.department.read")
    assert has_permission(granted, "org.department.update")
    assert not has_permission(granted, "org.department.create")
    assert not has_permission(granted, "org.department.delete")
    assert not has_permission(granted, "org.department")


def test_department_role_bundle_isolation() -> None:
    admin = {"org.department.create", "org.department.delete"}
    supervisor = {"org.department.read", "org.department.update"}
    effective = admin | supervisor
    assert has_permission(effective, "org.department.create")
    assert has_permission(effective, "org.department.read")
    assert has_permission(effective, "org.department.update")
    assert has_permission(effective, "org.department.delete")
    assert not has_permission(supervisor, "org.department.create")
    assert not has_permission(supervisor, "org.department.delete")
