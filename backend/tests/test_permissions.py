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
