use soroban_sdk::contracttype;

/// Who gets into the hackathon, and whether anybody has to say so.
///
/// Frozen with the rest of the rules rather than left as a setting, because it
/// decides who may enter and therefore who may win. An organizer who could
/// switch an open event to a reviewed one mid-week could shut out an entrant
/// after seeing what they were building, and one who could switch the other way
/// could let a hundred friends in on the morning of the community vote. Both
/// are exactly the moves the lock exists to prevent, so this is announced
/// before anybody applies and cannot move afterwards.
#[contracttype]
#[derive(Copy, Clone, Debug, Eq, PartialEq)]
#[repr(u32)]
pub enum RegistrationPolicy {
    /// Every application waits for the organizer or a collaborator.
    ///
    /// What a hackathon with limited places, a sponsor's eligibility rules or
    /// anything to screen for needs, and the reason the queue exists at all.
    Reviewed = 0,
    /// Anybody who applies is in from the moment they apply.
    ///
    /// The ordinary shape of an open event, and the one the product could not
    /// express: an organizer running a hackathon anybody may enter still had to
    /// sign once per applicant, which is a signature that decides nothing and a
    /// hundred chances to leave somebody waiting.
    ///
    /// It takes nothing away from the record. An entry made this way is still
    /// an application and still a decision, both announced in the same events
    /// the reviewed path emits, so a reader cannot tell the difference between
    /// "approved in a hurry" and "approved by the rules" — because there is
    /// none, and the rules that said so were hashed before anybody applied.
    Open = 1,
}

impl RegistrationPolicy {
    /// Whether an application is decided the moment it arrives.
    pub fn admits_immediately(self) -> bool {
        self == RegistrationPolicy::Open
    }
}
